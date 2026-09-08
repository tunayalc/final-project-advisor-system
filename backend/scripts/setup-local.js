const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, [
        'PORT=3000',
        `JWT_SECRET=${crypto.randomBytes(48).toString('hex')}`,
        'ADMIN_EMAIL=admin@ankara.edu.tr',
        `ADMIN_PASSWORD=${crypto.randomBytes(18).toString('base64url')}`,
        '',
    ].join('\n'), { flag: 'wx', mode: 0o600 });
    console.log('Yerel ayarlar backend/.env dosyasına kaydedildi.');
}
