const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const yauzl = require('yauzl');
const directory = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'advisor-export-test-'));
delete process.env.DATABASE_URL;
process.env.DB_PATH = path.join(directory, 'test.db');
process.env.ADMIN_PASSWORD = crypto.randomBytes(24).toString('hex');
const db = require('../db/database').getDb();
const { prepareExport, exportZip } = require('../services/system-export');
const { archiveSelection } = require('../services/selection-backups');

async function unzip(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(Buffer.concat(chunks), { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const files = new Map();
      zip.on('error', reject);
      zip.on('end', () => resolve(files));
      zip.on('entry', entry => zip.openReadStream(entry, (err, input) => {
        if (err) return reject(err);
        const buffers = [];
        input.on('error', reject);
        input.on('data', chunk => buffers.push(chunk));
        input.on('end', () => { files.set(entry.fileName, Buffer.concat(buffers)); zip.readEntry(); });
      }));
      zip.readEntry();
    });
  });
}

async function student(email, withPdf) {
  const user = await db.prepare('INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)')
    .run(email, 'SECRET_HASH_MUST_NOT_EXPORT', 'ogrenci', 'Archive Student');
  const row = await db.prepare('INSERT INTO students (user_id, gano, department_id, entry_year) VALUES (?, ?, ?, ?)')
    .run(user.lastInsertRowid, 3.2, 1, 2024);
  const content = Buffer.from(`%PDF-1.4\n${email}\noriginal bytes`);
  if (withPdf) await db.prepare('INSERT INTO student_transcripts (student_id, original_name, content, byte_size, sha256) VALUES (?, ?, ?, ?, ?)')
    .run(row.lastInsertRowid, 'same-name.pdf', content, content.length, crypto.createHash('sha256').update(content).digest('hex'));
  return { id: row.lastInsertRowid, userId: user.lastInsertRowid, content };
}

let first;
let second;
test('full ZIP contains original PDFs, all current tables and historical revisions without secrets', async () => {
  first = await student('first@example.invalid', true);
  second = await student('second@example.invalid', true);
  await student('missing@example.invalid', false);
  await db.prepare('INSERT INTO password_help_requests (user_id) VALUES (?)').run(first.userId);
  const faculty = await db.prepare('SELECT id FROM faculty ORDER BY id LIMIT 1').get();
  await db.transaction(async () => {
    await db.prepare('INSERT INTO preferences (student_id, faculty_id, rank) VALUES (?, ?, 1)').run(first.id, faculty.id);
    await archiveSelection(db, first.id, 'PREFERENCES_SAVED', { preferences: [{ faculty_id: faculty.id, rank: 1 }] });
    await db.prepare('UPDATE students SET is_assigned = 1, assigned_faculty_id = ? WHERE id = ?').run(faculty.id, first.id);
    await db.prepare('INSERT INTO assignment_logs (student_id, faculty_id, action, details) VALUES (?, ?, ?, ?)')
      .run(first.id, faculty.id, 'FORCE_ASSIGN', 'Test placement');
  })();
  const prepared = await prepareExport(db);
  try {
    const files = await unzip(exportZip(prepared));
    assert.deepEqual(files.get(`transkriptler/transkript-${first.id}.pdf`), first.content);
    assert.deepEqual(files.get(`transkriptler/transkript-${second.id}.pdf`), second.content);
    const manifest = JSON.parse(files.get('icerik.json'));
    assert.equal(manifest.record_counts.transcripts, 2);
    assert.equal(manifest.transcripts.filter(item => !item.available).length, 1);
    const json = files.get('sistem-kayitlari.json').toString();
    assert(!json.includes('SECRET_HASH_MUST_NOT_EXPORT'));
    assert(!json.includes('password_hash'));
    const { data } = JSON.parse(json);
    assert.equal(data.students.length, 3);
    assert.equal(data.password_help_requests.length, 1);
    assert.equal(data.password_help_requests[0].user_id, first.userId);
    assert(data.system_events.some(item => item.table_name === 'password_help_requests' && item.operation === 'INSERT'));
    assert.equal(data.preferences.length, 1);
    assert.equal(data.students.find(item => item.id === first.id).assigned_faculty_id, faculty.id);
    assert.equal(data.selection_backups[0].record.selection.preferences[0].rank, 1);
    assert(data.system_events.some(item => item.table_name === 'students' && item.operation === 'UPDATE' && item.after.is_assigned === 1));
    assert.equal(data.assignment_logs[0].action, 'FORCE_ASSIGN');
  } finally { await prepared.cleanup(); }
  await assert.rejects(fs.stat(prepared.directory), { code: 'ENOENT' });
});

test('transcript ZIP contains all PDFs with unique paths and a missing-file index', async () => {
  const prepared = await prepareExport(db, { transcriptsOnly: true });
  try {
    const files = await unzip(exportZip(prepared));
    assert.equal(files.size, 3);
    assert(!files.has('sistem-kayitlari.json'));
    assert.deepEqual(files.get(`transkriptler/transkript-${first.id}.pdf`), first.content);
    assert.deepEqual(files.get(`transkriptler/transkript-${second.id}.pdf`), second.content);
  } finally { await prepared.cleanup(); }
});

test('deleted identities and placements survive in audit; failed writes leave no history', async () => {
  const before = (await db.prepare('SELECT COUNT(*) AS c FROM system_events').get()).c;
  await assert.rejects(db.transaction(async () => {
    await db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run('Must roll back', first.userId);
    throw new Error('rollback');
  })(), /rollback/);
  assert.equal((await db.prepare('SELECT COUNT(*) AS c FROM system_events').get()).c, before);
  await db.transaction(async () => {
    await db.prepare('DELETE FROM preferences WHERE student_id = ?').run(first.id);
    await db.prepare('DELETE FROM assignment_logs WHERE student_id = ?').run(first.id);
    await db.prepare('DELETE FROM students WHERE id = ?').run(first.id);
    await db.prepare('DELETE FROM users WHERE id = ?').run(first.userId);
  })();
  const prepared = await prepareExport(db);
  try {
    const files = await unzip(exportZip(prepared));
    const { data } = JSON.parse(files.get('sistem-kayitlari.json'));
    assert(!data.users.some(item => item.id === first.userId));
    assert(!files.has(`transkriptler/transkript-${first.id}.pdf`));
    assert(data.system_events.some(item => item.table_name === 'users' && item.operation === 'DELETE' && item.before.email === 'first@example.invalid'));
    assert(data.system_events.some(item => item.table_name === 'assignment_logs' && item.operation === 'DELETE' && item.before.action === 'FORCE_ASSIGN'));
  } finally { await prepared.cleanup(); }
});

test('abort and corrupt PDF fail before delivering a partial archive', async () => {
  await assert.rejects(prepareExport(db, { aborted: () => true }), /bağlantısı/);
  await db.prepare('UPDATE student_transcripts SET sha256 = ? WHERE student_id = ?').run('invalid', second.id);
  await assert.rejects(prepareExport(db), /bütünlüğü/);
});

test('empty database produces a valid ZIP with an empty manifest', async () => {
  await require('../services/reset-system').resetSystem(db);
  const prepared = await prepareExport(db, { transcriptsOnly: true });
  try {
    const files = await unzip(exportZip(prepared));
    assert.equal(files.size, 1);
    const manifest = JSON.parse(files.get('icerik.json'));
    assert.deepEqual(manifest.transcripts, []);
    assert.equal(manifest.record_counts.transcripts, 0);
  } finally { await prepared.cleanup(); }
});

after(async () => { await db.close(); await fs.rm(directory, { recursive: true, force: true }); });
