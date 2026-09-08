const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { DEPARTMENT, TranscriptError, extractTranscriptInfo } = require('../services/transcript');
const { getDb } = require('../db/database');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            cb(new Error('Transkript PDF formatında olmalıdır.'));
            return;
        }
        cb(null, true);
    }
});

function handleTranscriptUpload(req, res, next) {
    upload.single('transcript')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message || 'Transkript yüklenemedi.' });
        }
        next();
    });
}

// GET /api/auth/departments
router.get('/departments', (req, res) => {
    try {
        const db = getDb();
        const departments = db.prepare('SELECT id, name FROM departments WHERE name = ?').all(DEPARTMENT);
        res.json(departments);
    } catch (err) {
        console.error('Departments error:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// POST /api/auth/register
router.post('/register', handleTranscriptUpload, async (req, res) => {
    try {
        const { email, password, full_name, entry_year, department_id } = req.body;
        const db = getDb();
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const normalizedName = String(full_name || '').trim();
        const parsedEntryYear = Number(entry_year);
        const departmentId = Number(department_id);

        if (!normalizedEmail || !password || !normalizedName || !entry_year || !department_id) {
            return res.status(400).json({ error: 'Ad soyad, e-posta, şifre, bölüm, giriş yılı ve transkript zorunludur.' });
        }

        if (String(password).length < 8) {
            return res.status(400).json({ error: 'Şifre en az 8 karakter olmalıdır.' });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
            return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
        }

        if (!Number.isInteger(departmentId) || departmentId <= 0) {
            return res.status(400).json({ error: 'Geçerli bir bölüm seçin.' });
        }

        if (!Number.isInteger(parsedEntryYear) || parsedEntryYear < 2000 || parsedEntryYear > 2100) {
            return res.status(400).json({ error: 'Geçerli bir giriş yılı girin.' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Transkript PDF dosyası yükleyin.' });
        }

        // Check if email exists
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
        if (existing) {
            return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı.' });
        }

        const department = db.prepare('SELECT id, name FROM departments WHERE id = ? AND name = ?').get(departmentId, DEPARTMENT);
        if (!department) {
            return res.status(400).json({ error: 'Kayıt yalnızca Yapay Zeka ve Veri Mühendisliği bölümüne açıktır.' });
        }

        const transcriptInfo = await extractTranscriptInfo(req.file.buffer, normalizedName);

        const password_hash = bcrypt.hashSync(String(password), 10);
        let userId;

        db.transaction(() => {
            const insertUser = db.prepare(
                'INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)'
            );
            const result = insertUser.run(normalizedEmail, password_hash, 'ogrenci', transcriptInfo.transcriptFullName);
            userId = result.lastInsertRowid;

            db.prepare(
                `INSERT INTO students (
                    user_id,
                    gano,
                    department_id,
                    entry_year,
                    approval_status,
                    transcript_full_name,
                    transcript_warning,
                    transcript_university,
                    transcript_department,
                    transcript_verified_at
                ) VALUES (?, ?, ?, ?, 'approved', ?, '', ?, ?, CURRENT_TIMESTAMP)`
            ).run(
                userId,
                transcriptInfo.gano,
                department.id,
                parsedEntryYear,
                transcriptInfo.transcriptFullName,
                transcriptInfo.transcriptUniversity,
                transcriptInfo.transcriptDepartment
            );

            db.prepare('INSERT INTO assignment_logs (student_id, action, details) VALUES ((SELECT id FROM students WHERE user_id = ?), ?, ?)')
                .run(userId, 'STUDENT_REGISTER', `Transkript alanları eşleşti, hesap otomatik onaylandı. GANO: ${transcriptInfo.gano}`);
        })();

        const token = jwt.sign(
            { id: userId, email: normalizedEmail, role: 'ogrenci', full_name: transcriptInfo.transcriptFullName },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            message: 'Transkript bilgileriniz eşleşti. Hesabınız onaylandı; tercihlerinizi oluşturabilirsiniz.',
            token,
            user: {
                id: userId,
                email: normalizedEmail,
                role: 'ogrenci',
                full_name: transcriptInfo.transcriptFullName,
                profile: {
                    department_id: department.id,
                    department_name: department.name,
                    gano: transcriptInfo.gano,
                    entry_year: parsedEntryYear,
                    approval_status: 'approved',
                    transcript_full_name: transcriptInfo.transcriptFullName,
                    transcript_warning: '',
                    transcript_university: transcriptInfo.transcriptUniversity,
                    transcript_department: transcriptInfo.transcriptDepartment
                }
            }
        });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı.' });
        }
        if (err instanceof TranscriptError) {
            return res.status(422).json({ error: err.message });
        }
        console.error('Register error:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    try {
        const { email, password } = req.body;
        const db = getDb();

        if (!email || !password) {
            return res.status(400).json({ error: 'E-posta ve şifre gerekli.' });
        }

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim().toLowerCase());
        if (!user) {
            return res.status(401).json({ error: 'Geçersiz e-posta veya şifre.' });
        }

        const valid = bcrypt.compareSync(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Geçersiz e-posta veya şifre.' });
        }

        if (user.role === 'hoca' && !db.prepare('SELECT id FROM faculty WHERE user_id = ? AND is_active = 1').get(user.id)) {
            return res.status(403).json({ error: 'Danışman hesabı aktif değil.' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Get role-specific info
        let profileInfo = {};
        if (user.role === 'ogrenci') {
            profileInfo = db.prepare('SELECT * FROM students WHERE user_id = ?').get(user.id) || {};
        } else if (user.role === 'hoca') {
            profileInfo = db.prepare('SELECT * FROM faculty WHERE user_id = ?').get(user.id) || {};
        }

        res.json({
            message: 'Giriş başarılı.',
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                full_name: user.full_name,
                profile: profileInfo
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        const db = getDb();

        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'Mevcut şifre ve yeni şifre zorunludur.' });
        }

        if (new_password.length < 8) {
            return res.status(400).json({ error: 'Yeni şifre en az 8 karakter olmalıdır.' });
        }

        const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }

        const valid = bcrypt.compareSync(current_password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Mevcut şifre doğrulanamadı.' });
        }

        const passwordHash = bcrypt.hashSync(new_password, 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, req.user.id);

        res.json({ message: 'Şifreniz başarıyla güncellendi.' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

module.exports = router;
