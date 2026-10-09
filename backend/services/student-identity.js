const { normalizeName } = require('./transcript');

class DuplicateStudentNameError extends Error {
    constructor() {
        super('Bu ad soyadla kayıtlı bir öğrenci hesabı zaten var. Aynı öğrenci için ikinci hesap oluşturulamaz. Mevcut hesabınıza giriş yapın veya Şifremi unuttum seçeneğini kullanın.');
    }
}

async function assertStudentNameAvailable(db, fullName, excludedUserId = 0) {
    const name = normalizeName(fullName);
    const students = await db.prepare(`
        SELECT u.full_name, s.transcript_full_name
        FROM users u
        LEFT JOIN students s ON s.user_id = u.id
        WHERE u.role = 'ogrenci' AND u.id <> ?
    `).all(excludedUserId);

    if (students.some(student => normalizeName(student.full_name) === name
        || (student.transcript_full_name && normalizeName(student.transcript_full_name) === name))) {
        throw new DuplicateStudentNameError();
    }
}

module.exports = { assertStudentNameAvailable, DuplicateStudentNameError };
