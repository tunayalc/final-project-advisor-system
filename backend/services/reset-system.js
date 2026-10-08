const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const path = require('node:path');
const { backupDirectory } = require('./selection-backups');
const { CORE_FACULTY } = require('../db/faculty-roster');

class ResetError extends Error {}

// Explicit maintenance action only; never invoked on startup or deployment.
async function resetSystem(db) {
  const email = (process.env.ADMIN_EMAIL || 'admin@ankara.edu.tr').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new ResetError('Sıfırlama için sunucuda ADMIN_PASSWORD en az 12 karakter olmalıdır.');
  }
  const passwordHash = bcrypt.hashSync(password, 12);
  const summary = await db.transaction(async () => {
    if (await db.prepare("SELECT id FROM users WHERE email = ? AND role = 'hoca'").get(email)) {
      throw new ResetError('Yönetici e-postası bir hoca hesabıyla çakışıyor.');
    }
    const removedUsers = (await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role <> 'hoca'").get()).count;
    const preservedFaculty = (await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'hoca'").get()).count;
    for (const table of ['password_help_requests', 'student_transcripts', 'preferences', 'pre_assignments', 'assignment_logs', 'selection_backups', 'students']) {
      await db.prepare(`DELETE FROM ${table}`).run();
    }
    await db.prepare("DELETE FROM users WHERE role <> 'hoca'").run();
    await db.prepare('UPDATE faculty SET base_quota = 0, current_quota = 0').run();
    // Restore the roster's initial activity while retaining all teacher identities/passwords.
    for (const [facultyEmail] of CORE_FACULTY) {
      await db.prepare('UPDATE faculty SET is_active = 1 WHERE roster_key = ?').run(facultyEmail);
    }
    await db.prepare('DELETE FROM departments WHERE id NOT IN (SELECT department_id FROM faculty)').run();
    await db.prepare('INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)')
      .run(email, passwordHash, 'admin', 'Sistem Yöneticisi');
    await db.prepare('DELETE FROM system_events').run();
    return { removedUsers, preservedFaculty, adminEmail: email };
  })();

  // Receipts contain personal data outside the database as well.
  const directory = backupDirectory();
  try {
    if (fs.existsSync(directory)) {
      for (const name of fs.readdirSync(directory)) {
        if (/^[a-f0-9-]{36}\.json(?:\.[a-f0-9-]{36}\.tmp)?$/.test(name)) {
          fs.unlinkSync(path.join(directory, name));
        }
      }
    }
  } catch {
    throw new ResetError('Veritabanı sıfırlandı; tercih yedeği dosyaları silinemedi. Sunucudaki yedek klasörünü temizleyin.');
  }
  return summary;
}

module.exports = { resetSystem, ResetError };
