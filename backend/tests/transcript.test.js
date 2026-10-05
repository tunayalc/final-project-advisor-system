const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractTranscriptText, TranscriptError } = require('../services/transcript');

const document = 'ANKARA ÜNİVERSİTESİ\nAdı Soyadı: Çağrı Öztürk\nBölüm: Yapay Zekâ ve Veri Mühendisliği\nGABNO: 3,42';
const obsDocument = fs.readFileSync(path.join(__dirname, 'fixtures/obs-transcript.txt'), 'utf8');

test('reads OBS column identity and final cumulative average across repeated page headers', () => {
    assert.deepEqual(extractTranscriptText(obsDocument, 'Mariam El Amrani'), {
        transcriptFullName: 'MARIAM EL AMRANI', gano: 3.44,
        transcriptUniversity: 'Ankara Üniversitesi', transcriptDepartment: 'Yapay Zeka ve Veri Mühendisliği',
    });
});

test('OBS registration does not depend on a Turkish citizenship number', () => {
    for (const text of [
        obsDocument.replaceAll('00000000000\n', ''),
        obsDocument.replaceAll('T.C. Kimlik No\n', '').replaceAll('00000000000\n', ''),
        obsDocument.replaceAll('T.C. Kimlik No', 'Y.U. Kimlik No').replaceAll('00000000000', 'FOREIGN-PASSPORT'),
    ]) assert.equal(extractTranscriptText(text, 'Mariam El Amrani').gano, 3.44);
});

test('OBS still rejects mismatched identity, department, university and missing cumulative average', () => {
    assert.throws(() => extractTranscriptText(obsDocument, 'Baska Ogrenci'), TranscriptError);
    for (const text of [
        obsDocument.replace('MARIAM\tAdi', 'BASKA\tAdi'),
        obsDocument.replace('EL AMRANI', 'BASKA SOYAD'),
        obsDocument.replaceAll('Yapay Zeka Ve Veri Muhendisligi', 'Bilgisayar Muhendisligi'),
        obsDocument.replaceAll('ANKARA UNIVERSITESI', 'GAZI UNIVERSITESI'),
        obsDocument.replace('ANKARA UNIVERSITESI', 'GAZI UNIVERSITESI'),
        obsDocument.replaceAll('GABNO', 'YABNO'),
        obsDocument.replaceAll('Fakulte\n', ''),
    ]) assert.throws(() => extractTranscriptText(text, 'Mariam El Amrani'), TranscriptError);
});

test('reads Turkish OBS labels and multi-part names', () => {
    const text = obsDocument.replaceAll('Soyadi', 'Soyadı').replaceAll('Adi', 'Adı')
        .replaceAll('Ogrenci No', 'Öğrenci No').replaceAll('Fakulte\n', 'Fakülte\n')
        .replaceAll('Bolum/Program', 'Bölüm/Program').replaceAll('Sinif / Yariyil / Donem', 'Sınıf / Yarıyıl / Dönem')
        .replaceAll('Kayit Tarihi', 'Kayıt Tarihi').replaceAll('EL AMRANI', 'ÖZTÜRK').replaceAll('MARIAM', 'DENİZ EGE');
    assert.equal(extractTranscriptText(text, 'Deniz Ege Öztürk').transcriptFullName, 'DENİZ EGE ÖZTÜRK');
});
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
