require('./config');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb, initializeDb } = require('./db/database');

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const facultyRoutes = require('./routes/faculty');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
    await getDb().prepare('SELECT 1').get();
    res.json({ status: 'ok' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'API adresi bulunamadı.' }));

if (process.env.NODE_ENV === 'production') {
    const publicDir = path.resolve(__dirname, '../frontend/dist');
    app.use(express.static(publicDir));
    app.get('/{*path}', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
}

// General Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Beklenmeyen bir hata oluştu.' });
});

initializeDb().then(() => {
    app.listen(PORT, () => console.log(`Backend sunucusu ${PORT} portunda çalışıyor.`));
}).catch(() => {
    console.error('Veritabanı başlatılamadı. Bağlantı ve kurulum ayarlarını kontrol edin.');
    process.exit(1);
});
