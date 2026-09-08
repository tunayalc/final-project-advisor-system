require('../config');
const bcrypt = require('bcryptjs');
const { getDb, initializeDb } = require('../db/database');

const email = String(process.argv[2] || '').trim().toLowerCase();
const password = process.env.ACCOUNT_PASSWORD;
if (!email || !password || password.length < 12) {
    throw new Error('E-posta argümanı ve en az 12 karakterli ACCOUNT_PASSWORD ortam değişkeni gerekli.');
}
async function main() {
await initializeDb();
const db = getDb();
const result = await db.prepare('UPDATE users SET password_hash = ? WHERE email = ?')
    .run(bcrypt.hashSync(password, 12), email);
await db.close();
if (!result.changes) throw new Error('Hesap bulunamadı.');
console.log('Hesap şifresi güncellendi.');
}
main().catch(() => { console.error('Şifre güncellenemedi. Hesabı ve bağlantı ayarlarını kontrol edin.'); process.exitCode = 1; });
