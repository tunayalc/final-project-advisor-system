const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

// Never connect these tests to the live database or read the developer's .env.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'advisor-registration-test-'));
delete process.env.DATABASE_URL;
process.env.DB_PATH = path.join(directory, 'test.db');
process.env.ADMIN_PASSWORD = crypto.randomBytes(24).toString('hex');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const { getDb } = require('../db/database');
const db = getDb();
const transcript = require('../services/transcript');
let readTranscript = async (_buffer, name) => ({
    transcriptFullName: name,
    gano: 2.62,
    transcriptUniversity: transcript.UNIVERSITY,
    transcriptDepartment: transcript.DEPARTMENT,
});
mock.method(transcript, 'extractTranscriptInfo', (...args) => readTranscript(...args));
const app = express();
app.use(express.json());
app.use('/api/auth', require('../routes/auth'));
app.use('/api/admin', require('../routes/admin'));
let server;
let baseUrl;

before(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

async function seedStudent(name, email, status = 'approved', transcriptName = name) {
    const user = await db.prepare('INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)')
        .run(email, 'not-a-login-password', 'ogrenci', name);
    const student = await db.prepare(`INSERT INTO students
        (user_id, gano, department_id, entry_year, approval_status, transcript_full_name)
        VALUES (?, ?, ?, ?, ?, ?)`).run(user.lastInsertRowid, 2.62, 1, 2024, status, transcriptName);
    return { userId: user.lastInsertRowid, studentId: student.lastInsertRowid };
}

async function register(name, email) {
    const data = new FormData();
    for (const [key, value] of Object.entries({ full_name: name, email, password: 'isolated-test-password', department_id: '1', entry_year: '2024' })) {
        data.append(key, value);
    }
    // PDF reading is stubbed; the actual upload, routes, transactions and database are exercised.
    data.append('transcript', new Blob(['isolated transcript fixture'], { type: 'application/pdf' }), 'test.pdf');
    const response = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', body: data });
    return { status: response.status, body: await response.json() };
}

test('a second email cannot register the same student, including case and spacing differences', async () => {
    await seedStudent('MUSAP SATAN', 'first@example.invalid');
    const beforeCount = (await db.prepare('SELECT COUNT(*) AS count FROM users').get()).count;
    const result = await register('  Musap   Satan  ', 'second@example.invalid');
    assert.equal(result.status, 409);
    assert.match(result.body.error, /ikinci hesap/);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM users').get()).count, beforeCount);
    assert.equal(await db.prepare('SELECT id FROM users WHERE email = ?').get('second@example.invalid'), undefined);
});

test('Turkish letters, Unicode accents and existing transcript identity cannot bypass the check', async () => {
    await seedStudent('Old display name', 'turkish@example.invalid', 'pending', 'İSMİHAN TÜRKMENOĞLU');
    const result = await register('ismihan türkmenoğlu', 'turkish-second@example.invalid');
    assert.equal(result.status, 409);
    await seedStudent('Mariam A.K. El Amrani', 'initials@example.invalid', 'rejected');
    assert.equal((await register('Mariam A. K. El Amrani', 'initials-second@example.invalid')).status, 409);
});

test('two simultaneous registrations create only one complete student account', async () => {
    const previousReader = readTranscript;
    let calls = 0;
    let release;
    const ready = new Promise(resolve => { release = resolve; });
    readTranscript = async (...args) => {
        calls++;
        if (calls === 2) release();
        await ready;
        return previousReader(...args);
    };
    try {
        const results = await Promise.all([
            register('Concurrent Student', 'race-one@example.invalid'),
            register('Concurrent Student', 'race-two@example.invalid'),
        ]);
        assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
        const users = await db.prepare('SELECT id FROM users WHERE full_name = ?').all('Concurrent Student');
        assert.equal(users.length, 1);
        const student = await db.prepare('SELECT id FROM students WHERE user_id = ?').get(users[0].id);
        assert(student);
        assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM student_transcripts WHERE student_id = ?').get(student.id)).count, 1);
        assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM assignment_logs WHERE student_id = ? AND action = ?').get(student.id, 'STUDENT_REGISTER')).count, 1);
    } finally {
        readTranscript = previousReader;
    }
});

test('different full names can register normally', async () => {
    assert.equal((await register('Different Student One', 'different-one@example.invalid')).status, 201);
    assert.equal((await register('Different Student Two', 'different-two@example.invalid')).status, 201);
});

test('admin review cannot rename an account into another student, but accepts its own name', async () => {
    await seedStudent('Review Target Student', 'review-target@example.invalid');
    const applicant = await seedStudent('Review Applicant Student', 'review-applicant@example.invalid', 'pending');
    const admin = await db.prepare("SELECT id, email, role FROM users WHERE role = 'admin'").get();
    const token = jwt.sign(admin, process.env.JWT_SECRET, { expiresIn: '5m' });
    const review = async name => {
        const response = await fetch(`${baseUrl}/api/admin/students/${applicant.studentId}/review`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ approval_status: 'approved', full_name: name, email: 'review-applicant@example.invalid', gano: 2.62, entry_year: 2024 }),
        });
        return response.status;
    };
    assert.equal(await review('Review Target Student'), 409);
    assert.equal((await db.prepare('SELECT full_name FROM users WHERE id = ?').get(applicant.userId)).full_name, 'Review Applicant Student');
    assert.equal(await review('Review Applicant Student'), 200);
});

after(async () => {
    mock.restoreAll();
    await new Promise(resolve => server.close(resolve));
    await db.close();
    fs.rmSync(directory, { recursive: true, force: true });
});
