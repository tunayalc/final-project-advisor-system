const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const { getDb } = require('../db/database');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const STUDENT_DEPARTMENT_ID = 1;
const STUDENT_DEPARTMENT_NAME = 'Yapay Zeka ve Veri Mühendisliği';

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

function normalizePersonName(value) {
    return String(value || '')
        .trim()
        .replace(/[çÇ]/g, 'c')
        .replace(/[ğĞ]/g, 'g')
        .replace(/[ıİiI]/g, 'i')
        .replace(/[öÖ]/g, 'o')
        .replace(/[şŞ]/g, 's')
        .replace(/[üÜ]/g, 'u')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

function extractGano(text) {
    const match = String(text || '').match(/\bGANO\b[^0-9]{0,80}([0-4](?:[.,]\d{1,2})?)/i);
    if (!match) {
        return null;
    }

    const value = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || value > 4) {
        return null;
    }

    return Number(value.toFixed(2));
}

function extractTranscriptName(text) {
    const patterns = [
        /(?:Adı\s*Soyadı|Ad\s*Soyad(?:ı)?|Öğrenci\s*Adı\s*Soyadı)\s*[:\-]?\s*([^\n\r]+)/i,
        /(?:Name\s*Surname|Student\s*Name)\s*[:\-]?\s*([^\n\r]+)/i
    ];

    for (const pattern of patterns) {
        const match = String(text || '').match(pattern);
        if (match?.[1]) {
            return match[1].replace(/\s+/g, ' ').trim();
        }
    }

    return '';
}

async function extractTranscriptInfo(buffer) {
    const parser = new PDFParse({ data: buffer });

    try {
        const result = await parser.getText();
        const text = result.text || '';
        const gano = extractGano(text);

        if (gano === null) {
            throw new Error('Transkript içinde GANO bilgisi okunamadı.');
        }

        return {
            gano,
            transcriptFullName: extractTranscriptName(text)
        };
    } finally {
        await parser.destroy();
    }
}

// POST /api/auth/register
router.post('/register', handleTranscriptUpload, async (req, res) => {
    try {
        const { email, password, full_name, entry_year } = req.body;
        const db = getDb();
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const normalizedName = String(full_name || '').trim();
        const parsedEntryYear = Number(entry_year);

        if (!normalizedEmail || !password || !normalizedName || !entry_year) {
            return res.status(400).json({ error: 'Ad soyad, e-posta, şifre, giriş yılı ve transkript zorunludur.' });
        }

        if (String(password).length < 8) {
            return res.status(400).json({ error: 'Şifre en az 8 karakter olmalıdır.' });
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

        const transcriptInfo = await extractTranscriptInfo(req.file.buffer);
        const transcriptWarning = transcriptInfo.transcriptFullName &&
            normalizePersonName(transcriptInfo.transcriptFullName) !== normalizePersonName(normalizedName)
            ? `Formdaki ad soyad ile transkriptte okunan ad farklı: ${transcriptInfo.transcriptFullName}`
            : '';

        const password_hash = bcrypt.hashSync(String(password), 10);
        let userId;

        db.transaction(() => {
            const insertUser = db.prepare(
                'INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)'
            );
            const result = insertUser.run(normalizedEmail, password_hash, 'ogrenci', normalizedName);
            userId = result.lastInsertRowid;

            db.prepare(
                `INSERT INTO students (
                    user_id,
                    gano,
                    department_id,
                    entry_year,
                    approval_status,
                    transcript_full_name,
                    transcript_warning
                ) VALUES (?, ?, ?, ?, 'pending', ?, ?)`
            ).run(
                userId,
                transcriptInfo.gano,
                STUDENT_DEPARTMENT_ID,
                parsedEntryYear,
                transcriptInfo.transcriptFullName,
                transcriptWarning
            );

            db.prepare('INSERT INTO assignment_logs (student_id, action, details) VALUES ((SELECT id FROM students WHERE user_id = ?), ?, ?)')
                .run(userId, 'STUDENT_REGISTER', `Öğrenci kaydı onay bekliyor. GANO: ${transcriptInfo.gano}`);
        })();

        const token = jwt.sign(
            { id: userId, email: normalizedEmail, role: 'ogrenci', full_name: normalizedName },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            message: 'Kayıt başarılı. Admin onayı bekleniyor.',
            token,
            user: {
                id: userId,
                email: normalizedEmail,
                role: 'ogrenci',
                full_name: normalizedName,
                profile: {
                    department_id: STUDENT_DEPARTMENT_ID,
                    department_name: STUDENT_DEPARTMENT_NAME,
                    gano: transcriptInfo.gano,
                    entry_year: parsedEntryYear,
                    approval_status: 'pending',
                    transcript_full_name: transcriptInfo.transcriptFullName,
                    transcript_warning: transcriptWarning
                }
            }
        });
    } catch (err) {
        console.error('Register error:', err);
        if (
            err.message === 'Transkript PDF formatında olmalıdır.' ||
            err.message === 'Transkript içinde GANO bilgisi okunamadı.'
        ) {
            return res.status(400).json({ error: err.message });
        }
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

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user) {
            return res.status(401).json({ error: 'Geçersiz e-posta veya şifre.' });
        }

        const valid = bcrypt.compareSync(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Geçersiz e-posta veya şifre.' });
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
