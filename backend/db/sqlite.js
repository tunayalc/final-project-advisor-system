const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DEFAULT_DB_PATH = path.join(__dirname, 'danisman_atama.db');
const DB_PATH = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : DEFAULT_DB_PATH;
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const { CORE_FACULTY } = require('./faculty-roster');
const RETIRED_EMAILS = ["ahmet.yilmaz@ankara.edu.tr","ayse.demir@ankara.edu.tr","mehmet.kaya@ankara.edu.tr","selin.yildiz@ankara.edu.tr","cem.arslan@ankara.edu.tr","deniz.kurt@ankara.edu.tr","elif.ozkan@ankara.edu.tr","furkan.celik@ankara.edu.tr","gizem.sahin@ankara.edu.tr","hakan.koc@ankara.edu.tr","irem.akyol@ankara.edu.tr","kaan.dogan@ankara.edu.tr","leyla.tas@ankara.edu.tr","mert.erdem@ankara.edu.tr","ikok@ankara.edu.tr"];

let db;

function hasColumn(tableName, columnName) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return columns.some((column) => column.name === columnName);
}

function migrateDb() {
    db.prepare("INSERT OR IGNORE INTO departments (id, name) VALUES (?, ?)").run(1, 'Yapay Zeka ve Veri Mühendisliği');
    db.prepare("INSERT OR IGNORE INTO departments (name) VALUES (?)").run('Yapay Zeka ve Veri Mühendisliği');

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
    for (const column of ['transcript_university', 'transcript_department']) {
        if (!hasColumn('students', column)) db.exec(`ALTER TABLE students ADD COLUMN ${column} TEXT DEFAULT ''`);
    }
    if (!hasColumn('students', 'transcript_verified_at')) {
        db.exec('ALTER TABLE students ADD COLUMN transcript_verified_at DATETIME');
    }
}

function ensureCoreFaculty() {
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
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
        // Preserve historical assignments; retired/demo accounts cannot be selected.
        for (const email of RETIRED_EMAILS) {
            db.prepare('UPDATE faculty SET is_active = 0 WHERE user_id IN (SELECT id FROM users WHERE email = ?)').run(email);
        }
        CORE_FACULTY.forEach(([email, fullName, departmentName, expertiseKeywords]) => {
            if (!getUser.get(email, 'hoca')) {
                insertUser.run(email, bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10), 'hoca', fullName);
            }
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
        fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
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

    // Fresh installations require an explicit administrator password.
    const adminCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count;
    if (adminCount === 0) {
        const password = process.env.ADMIN_PASSWORD;
        if (!password || password.length < 12) {
            throw new Error('İlk kurulum için ADMIN_PASSWORD en az 12 karakter olmalıdır.');
        }
        const bcrypt = require('bcryptjs');
        db.prepare('INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)')
            .run((process.env.ADMIN_EMAIL || 'admin@ankara.edu.tr').trim().toLowerCase(), bcrypt.hashSync(password, 12), 'admin', 'Sistem Yöneticisi');
    }

    ensureCoreFaculty();
}

module.exports = { getDb };
