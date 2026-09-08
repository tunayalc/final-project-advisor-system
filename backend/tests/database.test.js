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

after(async () => {
    await db.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith('advisor-db-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
});
