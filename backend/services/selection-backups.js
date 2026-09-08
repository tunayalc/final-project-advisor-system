const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function backupDirectory() {
  return path.resolve(process.env.SELECTION_BACKUP_DIR || path.join(
    process.env.DB_PATH ? path.dirname(path.resolve(process.env.DB_PATH)) : path.join(__dirname, '../db'),
    'selection-backups',
  ));
}

// Call inside the same transaction as the student's saved choice.
async function archiveSelection(db, studentId, action, selection) {
  const student = await db.prepare(`SELECT s.id, s.user_id, u.full_name, u.email,
    d.name AS department FROM students s JOIN users u ON u.id = s.user_id
    JOIN departments d ON d.id = s.department_id WHERE s.id = ?`).get(studentId);
  if (!student) throw new Error('Yedeklenecek öğrenci bulunamadı.');
  const record = {
    schema_version: 1,
    event_id: crypto.randomUUID(),
    saved_at: new Date().toISOString(),
    action,
    student,
    selection,
  };
  const content = JSON.stringify(record);
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  await db.prepare(`INSERT INTO selection_backups
    (event_id, student_id, action, saved_at, content, sha256) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(record.event_id, studentId, action, record.saved_at, content, sha256);
  return { event_id: record.event_id, content, sha256, saved_at: record.saved_at };
}

function writeBackupFile(backup) {
  if (!/^[a-f0-9-]{36}$/.test(backup.event_id)) throw new Error('Geçersiz yedek kimliği.');
  if (crypto.createHash('sha256').update(backup.content).digest('hex') !== backup.sha256) {
    throw new Error('Yedek bütünlüğü doğrulanamadı.');
  }
  const directory = backupDirectory();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, `${backup.event_id}.json`);
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  const document = JSON.stringify({ sha256: backup.sha256, record: JSON.parse(backup.content) }, null, 2) + '\n';
  // Atomic replacement also repairs a partial/old mirror on restart.
  fs.writeFileSync(temporary, document, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, target);
}

function mirrorSelection(backup) {
  try { writeBackupFile(backup); return true; }
  catch {
    // The committed database archive remains available for download and replay.
    console.error('Tercih dosyası yazılamadı; kalıcı arşiv korundu. Yeniden başlatmada tekrar oluşturulacak.');
    return false;
  }
}

async function restoreBackupFiles(db) {
  let cursor = 0;
  while (true) {
    const rows = await db.prepare('SELECT id, event_id, content, sha256 FROM selection_backups WHERE id > ? ORDER BY id LIMIT 500').all(cursor);
    if (!rows.length) break;
    for (const row of rows) {
      if (!mirrorSelection(row)) return;
      cursor = row.id;
    }
  }
}

module.exports = { archiveSelection, mirrorSelection, restoreBackupFiles, writeBackupFile, backupDirectory };
