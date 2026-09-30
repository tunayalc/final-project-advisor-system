const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const yazl = require('yazl');

const TABLES = {
  departments: '*',
  users: 'id, email, role, full_name, created_at',
  faculty: '*',
  students: '*',
  preferences: '*',
  pre_assignments: '*',
  assignment_logs: '*',
  selection_backups: '*',
  system_events: '*',
};

function transcriptBytes(transcript) {
  const content = Buffer.from(transcript.content);
  if (content.length !== transcript.byte_size || crypto.createHash('sha256').update(content).digest('hex') !== transcript.sha256) {
    throw new Error('Transkript bütünlüğü doğrulanamadı.');
  }
  return content;
}

function exportRow(table, row) {
  if (table === 'system_events') {
    const { before_json, after_json, ...event } = row;
    return { ...event, before: before_json ? JSON.parse(before_json) : null, after: after_json ? JSON.parse(after_json) : null };
  }
  if (table === 'selection_backups') {
    const { content, ...metadata } = row;
    if (crypto.createHash('sha256').update(content).digest('hex') !== row.sha256) throw new Error('Tercih arşivi bütünlüğü doğrulanamadı.');
    return { ...metadata, record: JSON.parse(content) };
  }
  return row;
}

// Spool a consistent snapshot to private temporary files, one PDF at a time.
// Database transactions finish before the client starts downloading the ZIP.
async function prepareExport(db, { transcriptsOnly = false, aborted = () => false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'advisor-export-'));
  const cleanup = () => fs.rm(directory, { recursive: true, force: true });
  const files = [];
  try {
    await db.snapshot(async () => {
      const metadata = await db.prepare(`SELECT s.id AS student_id, u.full_name, u.email,
        t.original_name, t.byte_size, t.sha256, t.uploaded_at,
        CASE WHEN t.id IS NULL THEN 0 ELSE 1 END AS available
        FROM students s JOIN users u ON u.id = s.user_id
        LEFT JOIN student_transcripts t ON t.student_id = s.id ORDER BY s.id`).all();
      const manifest = {
        schema_version: 1,
        exported_at: new Date().toISOString(),
        kind: transcriptsOnly ? 'transcripts' : 'system',
        record_counts: {},
        transcripts: metadata.map(row => ({ ...row, file: row.available ? `transkriptler/transkript-${row.student_id}.pdf` : null })),
      };
      const checkAborted = () => { if (aborted()) throw new Error('İndirme bağlantısı kapandı.'); };
      if (!transcriptsOnly) {
        const filename = 'sistem-kayitlari.json';
        const handle = await fs.open(path.join(directory, filename), 'wx', 0o600);
        try {
          await handle.write(`{"schema_version":1,"exported_at":${JSON.stringify(manifest.exported_at)},"data":{`);
          let firstTable = true;
          for (const [table, columns] of Object.entries(TABLES)) {
            await handle.write(`${firstTable ? '' : ','}${JSON.stringify(table)}:[`);
            firstTable = false;
            let cursor = 0;
            let count = 0;
            while (true) {
              checkAborted();
              const rows = await db.prepare(`SELECT ${columns} FROM ${table} WHERE id > ? ORDER BY id LIMIT 250`).all(cursor);
              if (!rows.length) break;
              for (const row of rows) {
                await handle.write(`${count++ ? ',' : ''}${JSON.stringify(exportRow(table, row))}`);
                cursor = row.id;
              }
            }
            manifest.record_counts[table] = count;
            await handle.write(']');
          }
          await handle.write('}}\n');
        } finally { await handle.close(); }
        files.push(filename);
      }
      await fs.mkdir(path.join(directory, 'transkriptler'), { mode: 0o700 });
      let cursor = 0;
      while (true) {
        checkAborted();
        const row = await db.prepare('SELECT id, student_id, content, byte_size, sha256 FROM student_transcripts WHERE id > ? ORDER BY id LIMIT 1').get(cursor);
        if (!row) break;
        const filename = `transkriptler/transkript-${row.student_id}.pdf`;
        await fs.writeFile(path.join(directory, filename), transcriptBytes(row), { flag: 'wx', mode: 0o600 });
        files.push(filename);
        cursor = row.id;
      }
      manifest.record_counts.transcripts = files.filter(name => name.endsWith('.pdf')).length;
      await fs.writeFile(path.join(directory, 'icerik.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
      files.push('icerik.json');
    })();
    return { directory, files, cleanup };
  } catch (error) { await cleanup(); throw error; }
}

function exportZip(prepared) {
  const zip = new yazl.ZipFile();
  zip.on('error', error => zip.outputStream.destroy(error));
  for (const filename of prepared.files) zip.addFile(path.join(prepared.directory, filename), filename);
  zip.end();
  return zip.outputStream;
}

module.exports = { prepareExport, exportZip, transcriptBytes };
