const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32 || JWT_SECRET === 'danisman-atama-secret-key-2024') {
    throw new Error('JWT_SECRET en az 32 karakterli, rastgele bir değer olmalıdır.');
}

// JWT doğrulama middleware
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Yetkilendirme tokeni gerekli.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token.' });
    }
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
