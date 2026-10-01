const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32 || JWT_SECRET === 'danisman-atama-secret-key-2024') {
    throw new Error('JWT_SECRET en az 32 karakterli, rastgele bir değer olmalıdır.');
}

// JWT doğrulama middleware
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Yetkilendirme tokeni gerekli.' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token.' });
    }
    try {
        const user = await getDb().prepare('SELECT id, role, email FROM users WHERE id = ?').get(decoded.id);
        if (!user || user.role !== decoded.role) {
            return res.status(401).json({ error: 'Hesap artık mevcut değil. Yeniden giriş yapın.' });
        }
        if (user.email !== decoded.email) {
            return res.status(401).json({ error: 'E-posta adresiniz değişti. Yeni adresinizle yeniden giriş yapın.' });
        }
        req.user = decoded;
        next();
    } catch (error) { next(error); }
}

// Rol bazlı yetkilendirme middleware
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Bu işlem için yetkiniz yok.' });
        }
        next();
    };
}

function getUserFromToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    try {
        return jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    } catch (err) {
        return null;
    }
}

module.exports = { authenticate, authorize, getUserFromToken, JWT_SECRET };
