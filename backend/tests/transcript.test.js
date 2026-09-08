const test = require('node:test');
const assert = require('node:assert/strict');
const { extractTranscriptText, TranscriptError } = require('../services/transcript');

const document = 'ANKARA ÜNİVERSİTESİ\nAdı Soyadı: Çağrı Öztürk\nBölüm: Yapay Zekâ ve Veri Mühendisliği\nGABNO: 3,42';
test('reads YOK column layout and prioritizes the overall average', () => {
    const text = `Öğrenci No
T.C. Kimlik No
Adı
Doğum Tarihi
12345678
00000000000
DENİZ EGE
01/01/2000
:
(Surname) :\tSoyadı YILMAZ
ANKARA ÜNİVERSİTESİ
Programı/ABD/ASD :Yapay Zeka Ve Veri Mühendisliği Pr.
Program Türü :Anadal
3.44\t:
Genel Not Ortalaması
(Cumulative GPA)
GANO: 2.67
Üniversite dışından ve öğrenimi öncesinde herhangi bir
programme in order to graduate.)`;
    const result = extractTranscriptText(text, 'Deniz Ege Yılmaz');
    assert.equal(result.transcriptFullName, 'DENİZ EGE YILMAZ');
    assert.equal(result.gano, 3.44);
    assert.throws(() => extractTranscriptText(text, 'Başka Öğrenci'), TranscriptError);
    assert.throws(() => extractTranscriptText(text.replace('Yapay Zeka Ve Veri Mühendisliği', 'Bilgisayar Mühendisliği'), 'Deniz Ege Yılmaz'), TranscriptError);
});
test('reads four fields with Turkish letters and a comma average', () => {
    assert.deepEqual(extractTranscriptText(document, '  Çağrı   Öztürk '), {
        transcriptFullName: 'Çağrı Öztürk', gano: 3.42,
        transcriptUniversity: 'Ankara Üniversitesi', transcriptDepartment: 'Yapay Zeka ve Veri Mühendisliği',
    });
});
test('supports separate labelled name and surname fields', () => {
    const text = document.replace('Adı Soyadı: Çağrı Öztürk', 'Adı (Name): Çağrı\nSoyadı (Surname): Öztürk');
    assert.equal(extractTranscriptText(text, 'Cagri Ozturk').transcriptFullName, 'Çağrı Öztürk');
});
test('supports labelled values on the next line', () => {
    assert.equal(extractTranscriptText(document.replaceAll(': ', ':\n'), 'Çağrı Öztürk').gano, 3.42);
});
test('uses the final cumulative average rather than a term average', () => {
    assert.equal(extractTranscriptText(document + '\nDANO: 1,20\nGANO: 3,65', 'Çağrı Öztürk').gano, 3.65);
});
test('does not accept a target department mentioned inside another department', () => {
    assert.throws(() => extractTranscriptText(document.replace('Bölüm: ', 'Bölüm: Bilgisayar Mühendisliği / '), 'Çağrı Öztürk'), TranscriptError);
});
test('conflicting names and institution values cannot auto approve', () => {
    for (const extra of ['\nAdı Soyadı: Başka Öğrenci', '\nÜniversite: Gazi Üniversitesi']) {
        assert.throws(() => extractTranscriptText(document + extra, 'Çağrı Öztürk'), TranscriptError);
    }
});
test('does not truncate invalid numeric values into valid averages', () => {
    for (const value of ['13.42', '-1.0', '4.01']) {
        assert.throws(() => extractTranscriptText(document.replace('3,42', value), 'Çağrı Öztürk'), TranscriptError);
    }
});
