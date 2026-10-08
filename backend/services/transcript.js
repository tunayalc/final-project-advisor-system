const { PDFParse } = require('pdf-parse');

const UNIVERSITY = 'Ankara Üniversitesi';
const DEPARTMENT = 'Yapay Zeka ve Veri Mühendisliği';

class TranscriptError extends Error {}

function fold(value) {
    return String(value || '').replace(/[ıİ]/g, 'i').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function normalizeName(value) {
    return fold(value).replace(/[’']/g, "'")
        .replace(/([\p{L}])\.(?=[\p{L}]|\s|$)/gu, '$1 ')
        .replace(/\s+/g, ' ').trim();
}

function validName(value) {
    const parts = String(value || '').trim().split(/\s+/);
    return parts.length >= 2 && parts.every(part => /^(?:[\p{L}]+(?:['’-][\p{L}]+)*|(?:[\p{L}]\.)+[\p{L}]?)$/u.test(part));
}

// Only explicitly labelled values are accepted; unrelated uppercase text is never guessed as a name.
function labelledValues(lines, label) {
    const expression = new RegExp(`^(?:${label})(?=\\s|[:：-]|$)(?:\\s*\\([^)]*\\))?\\s*(?:(?::|：|-)\\s*(.*)|$)`, 'i');
    return lines.flatMap((line, index) => {
        const match = fold(line).match(expression);
        if (!match) return [];
        const value = match[1] ? line.slice(line.length - match[1].length).trim() : lines[index + 1];
        return value ? [value] : [];
    });
}

function uniqueValue(values, normalize, error) {
    if (!values.length || new Set(values.map(normalize)).size !== 1) throw new TranscriptError(error);
    return values[0];
}

function normalizeIdentityLayout(lines) {
    const normalized = [];
    for (let index = 0; index < lines.length; index++) {
        // OBS emits the identity column's labels before its values. Match the
        // complete labelled block; citizenship/identity numbers are not required.
        if (fold(lines[index]) === 'OGRENCI NO') {
            let cursor = index + 1;
            if (/^(?:T\.?\s*C\.?|Y\.?\s*U\.?) KIMLIK NO$/.test(fold(lines[cursor]))) cursor++;
            // YÖK uses a different column block. A given name may include dotted
            // initials, and an identity number may be absent for foreign students.
            if (fold(lines[cursor]) === 'ADI' && fold(lines[cursor + 1]) === 'DOGUM TARIHI') {
                const start = cursor + 2;
                const end = [start + 2, start + 3].find(position => /^\d{2}\/\d{2}\/\d{4}$/.test(lines[position] || ''));
                if (!end) throw new TranscriptError('Transkriptte ad soyad alanı net okunamadı.');
                normalized.push(`Adı: ${lines[end - 1]}`);
                index = end;
                continue;
            }
            const labels = ['SOYADI', 'FAKULTE', 'BOLUM/PROGRAM', 'SINIF/YARIYIL/DONEM'];
            if (labels.every((label, offset) => fold(lines[cursor + offset]).replace(/\s*\/\s*/g, '/') === label)) {
                const start = cursor + labels.length;
                const end = [start + 5, start + 6].find(position => /^KAYIT TARIHI(?:\s|:)/.test(fold(lines[position])));
                if (end && /^\d+\s*\/\s*\d+\s*\/\s*\d+$/.test(lines[end - 1])) {
                    normalized.push(`Soyadı: ${lines[end - 4]}`, `Bölüm: ${lines[end - 2]}`);
                    index = end - 1;
                    continue;
                }
            }
        }
        // The given-name row is emitted as value<TAB>label in OBS PDFs.
        normalized.push(lines[index].replace(/^(.+?)\s+(?:Adı|Adi)$/iu, 'Adı: $1'));
    }
    return normalized;
}

function extractTranscriptText(text, submittedName) {
    // Normalize only labelled identity layouts; do not guess uppercase lines as names.
    text = String(text || '').replace(/^\(Surname\)\s*:\s*Soyad[ıi]\s+(.+)$/gmu, 'Soyadı: $1')
        .replace(/^Program[ıi]\/ABD\/ASD\s*:/gmu, 'Bölüm:');
    const lines = normalizeIdentityLayout(String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean));
    let names = labelledValues(lines, 'ADI\\s+SOYADI|AD\\s+SOYAD[I]?|OGRENCI\\s+ADI\\s+SOYADI|NAME\\s+SURNAME|STUDENT\\s+NAME');
    if (!names.length) {
        const given = labelledValues(lines, 'ADI|AD|GIVEN\\s+NAME|NAME');
        const surnames = labelledValues(lines, 'SOYADI|SOYAD|SURNAME');
        if (given.length && surnames.length) {
            const first = uniqueValue(given, normalizeName, 'Transkriptte birden fazla öğrenci adı bulundu.');
            const last = uniqueValue(surnames, normalizeName, 'Transkriptte birden fazla soyadı bulundu.');
            names = [`${first} ${last}`];
        }
    }
    const transcriptFullName = uniqueValue(names, normalizeName, 'Transkriptte ad soyad okunamadı veya tutarsız.');
    if (!validName(transcriptFullName)) {
        throw new TranscriptError('Transkriptte ad soyad alanı net okunamadı.');
    }
    if (normalizeName(transcriptFullName) !== normalizeName(submittedName)) {
        throw new TranscriptError(`Formdaki ad soyad transkriptteki öğrenci adıyla eşleşmiyor. PDF'den okunan ad soyad: ${transcriptFullName}. Adınızı bu alandaki haliyle kontrol edin.`);
    }

    const universityValues = labelledValues(lines.filter((line, index) =>
        /^(?:UNIVERSITE(?:SI)?|UNIVERSITY)(?:\s*\([^)]*\))?\s*[:：]/.test(fold(line)) ||
        /^(?:UNIVERSITE(?:SI)?|UNIVERSITY)$/.test(fold(line)) ||
        /^(?:UNIVERSITE(?:SI)?|UNIVERSITY)$/.test(fold(lines[index - 1]))
    ), 'UNIVERSITE(?:SI)?|UNIVERSITY');
    const acceptedUniversity = /^(?:(?:T\.?\s*C\.?|TURKIYE CUMHURIYETI)\s*)?ANKARA (?:UNIVERSITESI|UNIVERSITY)(?:\s*\(ANKARA UNIVERSITY\))?(?:\s+(?:TRANSKRIPT(?: BELGESI)?|TRANSCRIPT))?$/;
    const universityHeaders = lines.filter(line => acceptedUniversity.test(fold(line))
        || /^TURKIYE CUMHURIYETI .+ UNIVERSITESI$/.test(fold(line)));
    const universities = [...universityValues, ...universityHeaders];
    if (!universities.length || universities.some(value => !acceptedUniversity.test(fold(value)))) {
        throw new TranscriptError('Üniversite bilgisi okunamadı veya Ankara Üniversitesi ile eşleşmiyor.');
    }

    const departments = labelledValues(lines, 'BOLUM(?:U)?(?:\\s*/\\s*PROGRAM[I]?)?|PROGRAM[I]?(?!\\s+TURU)|DEPARTMENT|PROGRAMME');
    const acceptedDepartment = /^(?:YAPAY ZEKA VE VERI MUHENDISLIGI|ARTIFICIAL INTELLIGENCE AND DATA ENGINEERING)(?:\s+(?:BOLUMU|PROGRAMI|PR\.))?(?:\s*\((?:INGILIZCE|ENGLISH|ARTIFICIAL INTELLIGENCE AND DATA ENGINEERING)\))?$/;
    if (!departments.length || departments.some(value => !acceptedDepartment.test(fold(value)))) {
        throw new TranscriptError('Bölüm bilgisi okunamadı veya Yapay Zeka ve Veri Mühendisliği ile eşleşmiyor.');
    }

    const overallAverages = lines.flatMap((line, index) => {
        if (fold(line) !== 'GENEL NOT ORTALAMASI') return [];
        const before = lines[index - 1]?.match(/^([+-]?\d+(?:[.,]\d+)?)\s*:$/);
        return before ? [before[1]] : [];
    });
    const averages = [...fold(text).matchAll(/\b(?:GANO|GABNO|CGPA)\b\s*(?:\([^\n)]*\))?\s*[:=]?\s*([+-]?\d+(?:[.,]\d+)?)(?![\d.,])/g)];
    const values = (overallAverages.length ? overallAverages : averages.map(match => match[1]))
        .map(value => Number(value.replace(',', '.')));
    if (overallAverages.length && new Set(values).size !== 1) {
        throw new TranscriptError('Transkriptte genel not ortalaması bilgileri tutarsız.');
    }
    if (!values.length || values.some(value => !Number.isFinite(value) || value < 0 || value > 4)) {
        throw new TranscriptError('Transkriptte geçerli bir 0–4 arası GANO/GABNO okunamadı.');
    }
    // Cumulative averages may occur once per term; use the last one in document order.
    return {
        transcriptFullName,
        gano: Number(values.at(-1).toFixed(2)),
        transcriptUniversity: UNIVERSITY,
        transcriptDepartment: DEPARTMENT,
    };
}

async function extractTranscriptInfo(buffer, submittedName) {
    let parser;
    try {
        parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        return extractTranscriptText(result.text, submittedName);
    } catch (error) {
        if (error instanceof TranscriptError) throw error;
        throw new TranscriptError('PDF okunamadı. Metni seçilebilen, şifresiz bir transkript PDF yükleyin.');
    } finally {
        if (parser) await parser.destroy();
    }
}

module.exports = { UNIVERSITY, DEPARTMENT, TranscriptError, extractTranscriptInfo, extractTranscriptText };
