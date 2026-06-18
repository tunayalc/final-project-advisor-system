const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DEFAULT_DB_PATH = path.join(__dirname, 'danisman_atama.db');
const DB_PATH = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : DEFAULT_DB_PATH;
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const SEED_PATH = path.join(__dirname, 'seed.sql');
const CORE_FACULTY = [
    ['ahmet.yilmaz@ankara.edu.tr', 'Prof. Dr. Ahmet Yılmaz', 'Yapay Zeka ve Veri Mühendisliği', 'Yapay Zeka, Makine Öğrenmesi, Derin Öğrenme'],
    ['ayse.demir@ankara.edu.tr', 'Doç. Dr. Ayşe Demir', 'Yapay Zeka ve Veri Mühendisliği', 'Veri Madenciliği, Büyük Veri, NLP'],
    ['mehmet.kaya@ankara.edu.tr', 'Dr. Öğr. Üyesi Mehmet Kaya', 'Yapay Zeka ve Veri Mühendisliği', 'Veri Mühendisliği, Veri Tabanları, Dağıtık Sistemler'],
    ['selin.yildiz@ankara.edu.tr', 'Prof. Dr. Selin Yıldız', 'Yapay Zeka ve Veri Mühendisliği', 'Bilgisayarlı Görü, Üretken Yapay Zeka, MLOps'],
    ['cem.arslan@ankara.edu.tr', 'Prof. Dr. Cem Arslan', 'Bilgisayar Mühendisliği', 'Algoritmalar, Veri Yapıları, Rekabetçi Programlama'],
    ['deniz.kurt@ankara.edu.tr', 'Doç. Dr. Deniz Kurt', 'Bilgisayar Mühendisliği', 'Bilgisayar Ağları, Dağıtık Sistemler, Bulut Bilişim'],
    ['elif.ozkan@ankara.edu.tr', 'Dr. Öğr. Üyesi Elif Özkan', 'Bilgisayar Mühendisliği', 'Yazılım Mühendisliği, Gereksinim Analizi, Test Otomasyonu'],
    ['furkan.celik@ankara.edu.tr', 'Prof. Dr. Furkan Çelik', 'Bilgisayar Mühendisliği', 'Siber Güvenlik, Kriptografi, Ağ Güvenliği'],
    ['gizem.sahin@ankara.edu.tr', 'Doç. Dr. Gizem Şahin', 'Bilgisayar Mühendisliği', 'Veritabanları, Bilgi Sistemleri, Büyük Veri'],
    ['hakan.koc@ankara.edu.tr', 'Dr. Öğr. Üyesi Hakan Koç', 'Bilgisayar Mühendisliği', 'İşletim Sistemleri, Paralel Programlama, Sistem Yazılımı'],
    ['irem.akyol@ankara.edu.tr', 'Prof. Dr. İrem Akyol', 'Bilgisayar Mühendisliği', 'Grafik, İnsan Bilgisayar Etkileşimi, Oyun Teknolojileri'],
    ['kaan.dogan@ankara.edu.tr', 'Doç. Dr. Kaan Doğan', 'Bilgisayar Mühendisliği', 'Yapay Zeka, Makine Öğrenmesi, Robotik'],
    ['leyla.tas@ankara.edu.tr', 'Dr. Öğr. Üyesi Leyla Taş', 'Bilgisayar Mühendisliği', 'Programlama Dilleri, Derleyiciler, Formal Yöntemler'],
    ['mert.erdem@ankara.edu.tr', 'Prof. Dr. Mert Erdem', 'Bilgisayar Mühendisliği', 'Mobil Sistemler, Web Teknolojileri, Nesnelerin İnterneti'],
];

let db;

function hasColumn(tableName, columnName) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return columns.some((column) => column.name === columnName);
}

function migrateDb() {
    db.prepare("INSERT OR IGNORE INTO departments (id, name) VALUES (?, ?)").run(1, 'Yapay Zeka ve Veri Mühendisliği');
    db.prepare("INSERT OR IGNORE INTO departments (id, name) VALUES (?, ?)").run(2, 'Bilgisayar Mühendisliği');
    db.prepare("INSERT OR IGNORE INTO departments (name) VALUES (?)").run('Yapay Zeka ve Veri Mühendisliği');
    db.prepare("INSERT OR IGNORE INTO departments (name) VALUES (?)").run('Bilgisayar Mühendisliği');

    if (!hasColumn('faculty', 'is_active')) {
        db.prepare('ALTER TABLE faculty ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1').run();
    }

    if (!hasColumn('students', 'approval_status')) {
        db.prepare("ALTER TABLE students ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'").run();
    }

    if (!hasColumn('students', 'transcript_full_name')) {
        db.prepare("ALTER TABLE students ADD COLUMN transcript_full_name TEXT DEFAULT ''").run();
    }

    if (!hasColumn('students', 'transcript_warning')) {
        db.prepare("ALTER TABLE students ADD COLUMN transcript_warning TEXT DEFAULT ''").run();
    }
}

function ensureCoreFaculty() {
    const bcrypt = require('bcryptjs');
    const hocaHash = bcrypt.hashSync('hoca123', 10);
    const insertUser = db.prepare(
        'INSERT OR IGNORE INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)'
    );
    const getUser = db.prepare('SELECT id FROM users WHERE email = ? AND role = ?');
    const getDepartment = db.prepare('SELECT id FROM departments WHERE name = ?');
    const insertFaculty = db.prepare(`
        INSERT OR IGNORE INTO faculty (user_id, department_id, expertise_keywords, base_quota, current_quota, is_active)
        VALUES (?, ?, ?, 0, 0, 1)
    `);

    db.transaction(() => {
        CORE_FACULTY.forEach(([email, fullName, departmentName, expertiseKeywords]) => {
            insertUser.run(email, hocaHash, 'hoca', fullName);
            const user = getUser.get(email, 'hoca');
            const department = getDepartment.get(departmentName);
            if (user && department) {
                insertFaculty.run(user.id, department.id, expertiseKeywords);
            }
        });
    })();
}

function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        initializeDb();
    }
    return db;
}

function initializeDb() {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
    migrateDb();

    // Check if seed data is needed
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount === 0) {
        const seed = fs.readFileSync(SEED_PATH, 'utf8');
        db.exec(seed);

        // Hash passwords properly for seed data
        const bcrypt = require('bcryptjs');

        const adminHash = bcrypt.hashSync('admin123', 10);
        const hocaHash = bcrypt.hashSync('hoca123', 10);

        db.prepare('UPDATE users SET password_hash = ? WHERE role = ?').run(adminHash, 'admin');
        db.prepare('UPDATE users SET password_hash = ? WHERE role = ?').run(hocaHash, 'hoca');

        console.log('✅ Veritabanı seed verileri yüklendi.');
    }

    ensureCoreFaculty();
}

module.exports = { getDb };
