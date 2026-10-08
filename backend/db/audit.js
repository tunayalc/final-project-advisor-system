const AUDITED_TABLES = ['departments', 'users', 'students', 'faculty', 'preferences', 'pre_assignments', 'assignment_logs', 'student_transcripts', 'password_help_requests'];

function initializeSqliteAudit(db) {
  for (const table of AUDITED_TABLES) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all()
      .map(column => column.name).filter(name => !['password_hash', 'content'].includes(name));
    const snapshot = prefix => `json_object(${columns.map(name => `'${name}', ${prefix}."${name}"`).join(', ')})`;
    for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
      db.exec(`CREATE TRIGGER IF NOT EXISTS audit_${table}_${operation.toLowerCase()}
        AFTER ${operation} ON ${table} BEGIN
        INSERT INTO system_events (table_name, operation, record_id, before_json, after_json)
        VALUES ('${table}', '${operation}', ${operation === 'DELETE' ? 'OLD' : 'NEW'}.id,
          ${operation === 'INSERT' ? 'NULL' : snapshot('OLD')},
          ${operation === 'DELETE' ? 'NULL' : snapshot('NEW')}); END;`);
    }
  }
}

module.exports = { initializeSqliteAudit };
