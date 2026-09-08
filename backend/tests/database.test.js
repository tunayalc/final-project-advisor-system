const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

// Always isolated: this suite never reads the developer's .env or DATABASE_URL.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'advisor-db-test-'));
delete process.env.DATABASE_URL;
process.env.DB_PATH = path.join(directory, 'test.db');
process.env.ADMIN_PASSWORD = crypto.randomBytes(24).toString('hex');
const { getDb } = require('../db/database');
const db = getDb();
const { archiveSelection, writeBackupFile, restoreBackupFiles, backupDirectory } = require('../services/selection-backups');

test('async transactions roll back all writes when a later write fails', async () => {
    await assert.rejects(db.transaction(async () => {
        await db.prepare('INSERT INTO departments (name) VALUES (?)').run('Rollback test');
        await db.prepare('INSERT INTO departments (name) VALUES (?)').run('Rollback test');
    })());
    assert.equal(await db.prepare('SELECT id FROM departments WHERE name = ?').get('Rollback test'), undefined);
});

test('outside queries cannot join an awaited SQLite transaction', async () => {
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const transaction = db.transaction(async () => {
        await db.prepare('INSERT INTO departments (name) VALUES (?)').run('Isolation test');
        started();
        await gate;
        throw new Error('rollback');
    })();
    const rejected = assert.rejects(transaction, /rollback/);
    await ready;
    const outside = db.prepare('SELECT id FROM departments WHERE name = ?').get('Isolation test');
    release();
    await rejected;
    assert.equal(await outside, undefined);
});

test('selection history is atomic, keeps identity snapshots, and recreates lost files', async () => {
    const user = await db.prepare('INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)')
        .run('archive-test@example.invalid', 'not-a-login-password', 'ogrenci', 'Test Student');
    const department = await db.prepare('SELECT id FROM departments LIMIT 1').get();
    const student = await db.prepare('INSERT INTO students (user_id, gano, department_id, entry_year) VALUES (?, ?, ?, ?)')
        .run(user.lastInsertRowid, 3.2, department.id, 2024);
    const selection = { preferences: [{ rank: 1, faculty_id: 1, faculty_name: 'Test Advisor' }] };
    const before = (await db.prepare('SELECT COUNT(*) AS c FROM selection_backups').get()).c;
    await assert.rejects(db.transaction(async () => {
        await archiveSelection(db, student.lastInsertRowid, 'PREFERENCES_SAVED', selection);
        throw new Error('choice update failed');
    })(), /choice update failed/);
    assert.equal((await db.prepare('SELECT COUNT(*) AS c FROM selection_backups').get()).c, before);
    const backup = await db.transaction(() => archiveSelection(db, student.lastInsertRowid, 'PREFERENCES_SAVED', selection))();
    await db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run('Changed Name', user.lastInsertRowid);
    assert.equal(JSON.parse(backup.content).student.full_name, 'Test Student');
    writeBackupFile(backup);
    assert.equal(path.dirname(backupDirectory()), directory);
    const filename = path.join(backupDirectory(), `${backup.event_id}.json`);
    const original = fs.readFileSync(filename, 'utf8');
    fs.unlinkSync(filename);
    await restoreBackupFiles(db);
    assert.equal(fs.readFileSync(filename, 'utf8'), original);
    assert.throws(() => writeBackupFile({ ...backup, content: '{}' }), /bütünlüğü/);
    assert.equal(fs.readFileSync(filename, 'utf8'), original);
});

after(async () => {
    await db.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith('advisor-db-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
});
