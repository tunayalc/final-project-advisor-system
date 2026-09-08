require('../config');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');

const email = String(process.argv[2] || '').trim().toLowerCase();
const password = process.env.ACCOUNT_PASSWORD;
if (!email || !password || password.length < 12) {
    throw new Error('E-posta argümanı ve en az 12 karakterli ACCOUNT_PASSWORD ortam değişkeni gerekli.');
}
const db = getDb();
const result = db.prepare('UPDATE users SET password_hash = ? WHERE email = ?')
    .run(bcrypt.hashSync(password, 12), email);
db.close();
if (!result.changes) throw new Error('Hesap bulunamadı.');
console.log('Hesap şifresi güncellendi.');
