const { PDFParse } = require('pdf-parse');

const UNIVERSITY = 'Ankara Üniversitesi';
const DEPARTMENT = 'Yapay Zeka ve Veri Mühendisliği';

class TranscriptError extends Error {}

function fold(value) {
    return String(value || '').replace(/[ıİ]/g, 'i').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function normalizeName(value) {
    return fold(value).replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
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

function extractTranscriptText(text, submittedName) {
    // YÖK's PDF stores the four identity labels first, followed by their column values.
    // Match that exact layout instead of guessing an uppercase line as the student's name.
    text = String(text || '').replace(
        /Öğrenci No\s+T\.C\. Kimlik No\s+Adı\s+Doğum Tarihi\s+\d+\s+\d{11}\s+([\p{L} '\u2019-]+)\s+\d{2}\/\d{2}\/\d{4}/gu,
        'Adı: $1'
    ).replace(/^\(Surname\)\s*:\s*Soyadı\s+(.+)$/gm, 'Soyadı: $1')
        .replace(/^Programı\/ABD\/ASD\s*:/gm, 'Bölüm:');
    const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
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
    if (!/^[\p{L}]+(?:[ '\u2019-][\p{L}]+)+$/u.test(transcriptFullName)) {
        throw new TranscriptError('Transkriptte ad soyad alanı net okunamadı.');
    }
    if (normalizeName(transcriptFullName) !== normalizeName(submittedName)) {
        throw new TranscriptError('Formdaki ad soyad transkriptteki öğrenci adıyla eşleşmiyor.');
    }

    const universityValues = labelledValues(lines.filter((line, index) =>
        /^(?:UNIVERSITE(?:SI)?|UNIVERSITY)(?:\s*\([^)]*\))?\s*[:：]/.test(fold(line)) ||
        /^(?:UNIVERSITE(?:SI)?|UNIVERSITY)$/.test(fold(line)) ||
        /^(?:UNIVERSITE(?:SI)?|UNIVERSITY)$/.test(fold(lines[index - 1]))
    ), 'UNIVERSITE(?:SI)?|UNIVERSITY');
    const universityHeaders = lines.filter(line => /^(?:T\.?\s*C\.?\s*)?ANKARA (?:UNIVERSITESI|UNIVERSITY)(?:\s*\(ANKARA UNIVERSITY\))?(?:\s+(?:TRANSKRIPT(?: BELGESI)?|TRANSCRIPT))?$/i.test(fold(line)));
    const universities = [...universityValues, ...universityHeaders];
    if (!universities.length || universities.some(value => !/^(?:T\.?\s*C\.?\s*)?ANKARA (?:UNIVERSITESI|UNIVERSITY)(?:\s*\(ANKARA UNIVERSITY\))?(?:\s+(?:TRANSKRIPT(?: BELGESI)?|TRANSCRIPT))?$/.test(fold(value)))) {
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
