const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { calculateAllocation, allocate } = require('../engine/allocation');

const teacher = (id, department_id = 1) => ({ id, department_id, is_active: 1 });
const student = (id, gano = 3, department_id = 1) => ({ id, gano, department_id });
const pref = (student_id, faculty_id, rank = 1) => ({ student_id, faculty_id, rank });

test('extra seats follow early quota completion, including second preferences, not teacher IDs or first-choice counts', () => {
  const students = [student(1, 4), student(2, 3.9), student(3, 3.8), student(4, 1), student(5, 0.9), student(6, 0.8), student(7, 0.7)];
  const faculty = [teacher(10), teacher(20), teacher(30)];
  const preferences = [pref(1, 30), pref(2, 30), pref(3, 30), pref(3, 20, 2), pref(4, 20), pref(5, 10), pref(6, 10), pref(7, 10)];
  const result = calculateAllocation(students, faculty, preferences);
  assert.deepEqual(result.faculty.map(f => [f.id, f.base_quota]), [[30, 3], [20, 2], [10, 2]]);
  assert.deepEqual(result, calculateAllocation([...students].reverse(), [...faculty].reverse(), [...preferences].reverse()));
  assert.equal(result.assignments.length, 7);
  assert.equal(new Set(result.assignments.map(a => a.student_id)).size, 7);
});

test('arbitrary cohort sizes remain balanced and exhaust exactly available students', () => {
  for (const [n, m] of [[22, 4], [30, 9], [12, 3], [2, 5], [0, 4], [41, 7], [1, 1]]) {
    const students = Array.from({ length: n }, (_, i) => student(i + 1, 4 - i / Math.max(n, 1)));
    const faculty = Array.from({ length: m }, (_, i) => teacher(i + 1));
    const result = calculateAllocation(students, faculty, []);
    const quotas = result.faculty.map(f => f.base_quota);
    assert.equal(quotas.reduce((sum, q) => sum + q, 0), n);
    assert(Math.max(...quotas) - Math.min(...quotas) <= 1);
    assert.equal(result.assignments.filter(a => a.faculty_id !== null).length, n);
    assert.equal(result.assignments.filter(a => a.method === 'fallback').length, n);
  }
});

test('departments, inactive teachers, missing preferences and no teachers are handled independently', () => {
  const students = [student(1, 3, 1), student(2, 4, 2), student(3, 2, 3)];
  const faculty = [teacher(1, 1), teacher(2, 2), { ...teacher(3, 3), is_active: 0 }];
  const result = calculateAllocation(students, faculty, [pref(1, 2), pref(1, 1, 2), pref(2, 1), pref(3, 3)]);
  assert.equal(result.assignments.find(a => a.student_id === 1).faculty_id, 1);
  assert.equal(result.assignments.find(a => a.student_id === 2).faculty_id, 2);
  assert.equal(result.assignments.find(a => a.student_id === 3).method, 'unplaced');
  assert.equal(result.faculty.length, 2);
});

test('ties and fallback preserve existing stable rules and fixed initial counts', () => {
  const students = [student(2, 3), student(1, 3), student(3, 2)];
  const result = allocate(students, [teacher(1), teacher(2)], [pref(2, 1), pref(1, 1)], { 1: 2, 2: 2 }, { 1: 1 });
  assert.equal(result.assignments.find(a => a.student_id === 1).faculty_id, 1);
  assert.equal(result.assignments.find(a => a.student_id === 2).faculty_id, 2);
  assert.deepEqual(result.counts, { 1: 2, 2: 2 });
});

// Isolated database: these tests never connect to production or load .env.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'advisor-reassignment-test-'));
delete process.env.DATABASE_URL;
process.env.DB_PATH = path.join(directory, 'test.db');
process.env.ADMIN_PASSWORD = crypto.randomBytes(24).toString('hex');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const { getDb } = require('../db/database');
const db = getDb();
const { archiveSelection } = require('../services/selection-backups');
const { previewReassignment, applyReassignment } = require('../services/reassignment');
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/admin', require('../routes/admin'));
let server, baseUrl, adminToken, ordinaryToken;
let studentIds = [], teacherIds = [], archiveText;

before(async () => {
  await db.prepare('UPDATE faculty SET is_active = 0').run();
  for (let i = 1; i <= 2; i++) {
    const u = await db.prepare('INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)').run(`teacher-${i}@example.invalid`, 'test', 'hoca', `Teacher ${i}`);
    const f = await db.prepare('INSERT INTO faculty (user_id, department_id, is_active) VALUES (?, 1, 1)').run(u.lastInsertRowid);
    teacherIds.push(f.lastInsertRowid);
  }
  const receipts = [];
  for (let i = 1; i <= 5; i++) {
    const u = await db.prepare('INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)').run(`student-${i}@example.invalid`, 'test', 'ogrenci', `Student ${i}`);
    const s = await db.prepare('INSERT INTO students (user_id, gano, department_id, entry_year) VALUES (?, ?, 1, 2024)').run(u.lastInsertRowid, 4 - i / 10);
    studentIds.push(s.lastInsertRowid);
    await db.prepare('INSERT INTO preferences (student_id, faculty_id, rank) VALUES (?, ?, 1)').run(s.lastInsertRowid, teacherIds[0]);
    const backup = await archiveSelection(db, s.lastInsertRowid, 'PREFERENCES_SAVED', { preferences: [{ faculty_id: teacherIds[0], rank: 1 }] });
    receipts.push(JSON.stringify({ sha256: backup.sha256, record: JSON.parse(backup.content) }));
    if (i === 1) ordinaryToken = jwt.sign({ id: u.lastInsertRowid, role: 'ogrenci', email: `student-${i}@example.invalid` }, process.env.JWT_SECRET);
  }
  // Latest archive explicitly saves no preferences for one student.
  const empty = await archiveSelection(db, studentIds[4], 'PREFERENCES_SAVED', { preferences: [] });
  receipts.push(JSON.stringify({ sha256: empty.sha256, record: JSON.parse(empty.content) }));
  // Deleted student remains only in history and must never be recreated.
  const deletedUser = await db.prepare('INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)').run('deleted@example.invalid', 'test', 'ogrenci', 'Deleted Student');
  const deletedStudent = await db.prepare('INSERT INTO students (user_id, gano, department_id, entry_year) VALUES (?, 3, 1, 2024)').run(deletedUser.lastInsertRowid);
  const deletedBackup = await archiveSelection(db, deletedStudent.lastInsertRowid, 'PREFERENCES_SAVED', { preferences: [{ faculty_id: teacherIds[1], rank: 1 }] });
  receipts.push(JSON.stringify({ sha256: deletedBackup.sha256, record: JSON.parse(deletedBackup.content) }));
  await db.prepare('DELETE FROM students WHERE id = ?').run(deletedStudent.lastInsertRowid);
  await db.prepare('DELETE FROM users WHERE id = ?').run(deletedUser.lastInsertRowid);
  archiveText = receipts.join('\n');
  await db.prepare('INSERT INTO student_transcripts (student_id, original_name, content, byte_size, sha256) VALUES (?, ?, ?, ?, ?)')
    .run(studentIds[0], 'fixture.pdf', Buffer.from('fixture'), 7, crypto.createHash('sha256').update('fixture').digest('hex'));
  const admin = await db.prepare("SELECT id, role, email FROM users WHERE role = 'admin'").get();
  adminToken = jwt.sign(admin, process.env.JWT_SECRET);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/reassignment`;
});

async function request(action, body, token = adminToken) {
  const res = await fetch(`${baseUrl}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

test('preview is admin-only, read-only and chooses latest saved preferences including empty lists', async () => {
  assert.equal((await request('preview', {}, null)).status, 401);
  assert.equal((await request('preview', {}, ordinaryToken)).status, 403);
  assert.equal((await request('apply', {}, ordinaryToken)).status, 403);
  const before = await db.prepare('SELECT * FROM students ORDER BY id').all();
  const result = await request('preview', { archive_text: archiveText, source_name: 'test.jsonl' });
  assert.equal(result.status, 200);
  assert.equal(result.body.stats.totalStudents, 5);
  assert.equal(result.body.source.preference_count, 4);
  assert.equal(result.body.assignments.find(a => a.student_id === studentIds[4]).method, 'fallback');
  assert.deepEqual(await db.prepare('SELECT * FROM students ORDER BY id').all(), before);
});

test('malformed, modified, unrecognized and incomplete archives are rejected', async () => {
  for (const archive_text of ['{', '', archiveText.replace('Student 1', 'Changed Name'), archiveText.split('\n').slice(1).join('\n')]) {
    assert.equal((await request('preview', { archive_text })).status, 400);
  }
  const wrapper = JSON.parse(archiveText.split('\n')[0]);
  wrapper.record.student.id = 999999;
  wrapper.sha256 = crypto.createHash('sha256').update(JSON.stringify(wrapper.record)).digest('hex');
  assert.equal((await request('preview', { archive_text: JSON.stringify(wrapper) })).status, 400);
  const large = archiveText + '\n' + ' '.repeat(110000);
  assert.equal((await request('preview', { archive_text: large })).status, 200);
  assert.equal((await request('preview', { archive_text: ' '.repeat(5 * 1024 * 1024 + 1) })).status, 400);
});

test('stale inputs are rejected, apply reruns assigned students and preserves records, preferences, PDFs and history', async () => {
  const input = { archive_text: archiveText, source_name: 'test.jsonl' };
  const preview = await previewReassignment(db, input);
  await db.prepare('UPDATE students SET gano = ? WHERE id = ?').run(3.85, studentIds[0]);
  assert.equal((await request('apply', { ...input, fingerprint: preview.fingerprint })).status, 409);
  await db.prepare('UPDATE students SET is_assigned = 1, assigned_faculty_id = ? WHERE id = ?').run(teacherIds[1], studentIds[0]);
  const current = await previewReassignment(db, input);
  const preserved = {};
  for (const table of ['users', 'preferences', 'student_transcripts', 'selection_backups']) preserved[table] = await db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  const result = await applyReassignment(db, { ...input, fingerprint: current.fingerprint }, 1);
  assert.equal(result.applied, true);
  assert.equal(result.stats.totalStudents, 5);
  assert.equal((await db.prepare('SELECT assigned_faculty_id FROM students WHERE id = ?').get(studentIds[0])).assigned_faculty_id, teacherIds[0]);
  for (const [table, rows] of Object.entries(preserved)) assert.deepEqual(await db.prepare(`SELECT * FROM ${table} ORDER BY id`).all(), rows);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM assignment_logs WHERE action = 'REASSIGN_STUDENT'").get()).n, 5);
  const log = await db.prepare("SELECT details FROM assignment_logs WHERE action = 'REASSIGNMENT_RUN'").get();
  assert.equal(JSON.parse(log.details).source.sha256, result.source.sha256);
  assert.equal(JSON.parse(log.details).assignments.length, 5);
  const rerun = await previewReassignment(db, input);
  assert.equal(rerun.stats.changed, 0);
  assert.deepEqual(rerun.assignments.map(a => a.faculty_id), result.assignments.map(a => a.faculty_id));
});

test('two simultaneous apply requests allow one run and reject the stale second run', async () => {
  const input = { archive_text: archiveText, source_name: 'test.jsonl' };
  await db.prepare('UPDATE students SET is_assigned = 0, assigned_faculty_id = NULL WHERE id = ?').run(studentIds[0]);
  const preview = await previewReassignment(db, input);
  const results = await Promise.all([request('apply', { ...input, fingerprint: preview.fingerprint }), request('apply', { ...input, fingerprint: preview.fingerprint })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});

test('failure during quota writes rolls back every assignment and audit log', async () => {
  await db.prepare('UPDATE students SET is_assigned = 0, assigned_faculty_id = NULL WHERE id = ?').run(studentIds[0]);
  const input = { archive_text: archiveText };
  const preview = await previewReassignment(db, input);
  const before = await db.prepare('SELECT * FROM students ORDER BY id').all();
  const logs = await db.prepare('SELECT * FROM assignment_logs ORDER BY id').all();
  const failingDb = { ...db, prepare: sql => sql.startsWith('UPDATE faculty SET base_quota')
    ? { run: async () => { throw new Error('Test write failure'); } } : db.prepare(sql) };
  await assert.rejects(applyReassignment(failingDb, { ...input, fingerprint: preview.fingerprint }), /Test write failure/);
  assert.deepEqual(await db.prepare('SELECT * FROM students ORDER BY id').all(), before);
  assert.deepEqual(await db.prepare('SELECT * FROM assignment_logs ORDER BY id').all(), logs);
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
