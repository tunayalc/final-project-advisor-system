const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DEFAULT_DB_PATH = path.join(__dirname, 'danisman_atama.db');
const DB_PATH = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : DEFAULT_DB_PATH;
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const SEED_PATH = path.join(__dirname, 'seed.sql');

let db;

function hasColumn(tableName, columnName) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return columns.some((column) => column.name === columnName);
}

function migrateDb() {
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
}

module.exports = { getDb };
