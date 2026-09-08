const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { CORE_FACULTY } = require('./faculty-roster');

module.exports = async function seedPostgres(db) {
    await db.transaction(async () => {
        await db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)').run('Yapay Zeka ve Veri Mühendisliği');
        const admin = await db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
        if (!admin) {
            const password = process.env.ADMIN_PASSWORD;
            if (!password || password.length < 12) throw new Error('ADMIN_PASSWORD en az 12 karakter olmalıdır.');
            await db.prepare('INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)')
                .run((process.env.ADMIN_EMAIL || 'admin@ankara.edu.tr').trim().toLowerCase(), bcrypt.hashSync(password, 12), 'admin', 'Sistem Yöneticisi');
        }
        for (const [email, fullName, departmentName, keywords] of CORE_FACULTY) {
            let user = await db.prepare('SELECT id FROM users WHERE email = ? AND role = ?').get(email, 'hoca');
            if (!user) {
                await db.prepare('INSERT OR IGNORE INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)')
                    .run(email, bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10), 'hoca', fullName);
                user = await db.prepare('SELECT id FROM users WHERE email = ? AND role = ?').get(email, 'hoca');
            }
            const department = await db.prepare('SELECT id FROM departments WHERE name = ?').get(departmentName);
            if (user && department) await db.prepare('INSERT OR IGNORE INTO faculty (user_id, department_id, expertise_keywords) VALUES (?, ?, ?)').run(user.id, department.id, keywords);
        }
    })();
};
