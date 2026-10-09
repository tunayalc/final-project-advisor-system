const crypto = require('node:crypto');
const { calculateAllocation } = require('../engine/allocation');

const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const ARCHIVE_LIMIT = 5 * 1024 * 1024;
class ReassignmentError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

async function readState(db) {
  // Ordered, non-secret input snapshots make preview fingerprints reproducible.
  const users = await db.prepare('SELECT id, email, role, full_name FROM users ORDER BY id').all();
  const students = await db.prepare(`SELECT s.id, s.user_id, s.gano, s.department_id, s.approval_status,
    s.is_assigned, s.assigned_faculty_id, u.full_name AS student_name, u.email AS student_email,
    d.name AS department_name FROM students s JOIN users u ON u.id = s.user_id
    JOIN departments d ON d.id = s.department_id ORDER BY s.id`).all();
  const faculty = await db.prepare(`SELECT f.id, f.user_id, f.department_id, f.is_active, f.base_quota,
    f.current_quota, u.full_name AS faculty_name, d.name AS department_name
    FROM faculty f JOIN users u ON u.id = f.user_id JOIN departments d ON d.id = f.department_id ORDER BY f.id`).all();
  const preferences = await db.prepare('SELECT student_id, faculty_id, rank FROM preferences ORDER BY student_id, rank').all();
  return { users, students, faculty, preferences };
}

function validId(id) { return Number.isSafeInteger(id) && id > 0; }

async function selectPreferences(db, state, input = {}) {
  if (input.source_name !== undefined && (typeof input.source_name !== 'string' || input.source_name.length > 200)) {
    throw new ReassignmentError('Tercih kaynağı adı en fazla 200 karakter olmalıdır.');
  }
  const students = state.students.filter(s => s.approval_status === 'approved');
  const studentIds = new Set(students.map(s => s.id));
  if (input.archive_text === undefined) {
    const preferences = state.preferences.filter(p => studentIds.has(p.student_id));
    return { preferences, source: { name: 'Güncel kayıtlı tercihler', mode: 'current',
      sha256: hash(JSON.stringify(preferences)), selected_students: students.length, preference_count: preferences.length } };
  }
  if (typeof input.archive_text !== 'string' || !input.archive_text.trim() || Buffer.byteLength(input.archive_text) > ARCHIVE_LIMIT) {
    throw new ReassignmentError('Tercih arşivi boş olamaz ve en fazla 5 MB olabilir.');
  }
  const archived = await db.prepare('SELECT id, event_id, student_id, content, sha256 FROM selection_backups ORDER BY id').all();
  const receipts = new Map(archived.map(r => [r.event_id, r]));
  const latest = new Map();
  const seen = new Set();
  let receiptCount = 0;
  for (const [index, line] of input.archive_text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let wrapper;
    try { wrapper = JSON.parse(line); } catch { throw new ReassignmentError(`Tercih arşivinin ${index + 1}. satırı geçerli JSON değil.`); }
    const record = wrapper?.record;
    if (!record || record.schema_version !== 1 || typeof record.event_id !== 'string' ||
        typeof record.action !== 'string' || !validId(record.student?.id) || !validId(record.student?.user_id) ||
        typeof record.saved_at !== 'string' || !Number.isFinite(Date.parse(record.saved_at)) ||
        typeof wrapper.sha256 !== 'string' || hash(JSON.stringify(record)) !== wrapper.sha256) {
      throw new ReassignmentError(`Tercih arşivinin ${index + 1}. satırının bütünlüğü doğrulanamadı.`);
    }
    const receipt = receipts.get(record.event_id);
    if (!receipt || receipt.sha256 !== wrapper.sha256 || hash(receipt.content) !== wrapper.sha256 || receipt.student_id !== record.student.id) {
      throw new ReassignmentError(`Tercih arşivinin ${index + 1}. satırı sunucudaki kayıtla eşleşmiyor.`);
    }
    if (seen.has(record.event_id)) continue;
    seen.add(record.event_id);
    receiptCount++;
    if (record.action !== 'PREFERENCES_SAVED') continue;
    const list = record.selection?.preferences;
    if (!Array.isArray(list) || list.some(p => !validId(p.faculty_id) || !validId(p.rank)) ||
        new Set(list.map(p => p.faculty_id)).size !== list.length ||
        [...list].sort((a, b) => a.rank - b.rank).some((p, i) => p.rank !== i + 1)) {
      throw new ReassignmentError(`Tercih arşivinin ${index + 1}. satırındaki tercih sırası geçersiz.`);
    }
    if (!studentIds.has(record.student.id)) continue;
    const previous = latest.get(record.student.id);
    if (!previous || Date.parse(record.saved_at) > Date.parse(previous.record.saved_at) ||
        (Date.parse(record.saved_at) === Date.parse(previous.record.saved_at) && receipt.id > previous.receiptId)) {
      latest.set(record.student.id, { record, receiptId: receipt.id });
    }
  }
  const preferences = [];
  const selectedEvents = [];
  for (const student of students) {
    const saved = latest.get(student.id);
    if (!saved) throw new ReassignmentError(`${student.student_name} için arşivde kaydedilmiş tercih bulunamadı. Güncel tüm öğrencileri içeren arşivi seçin.`);
    if (saved.record.student.user_id !== student.user_id) throw new ReassignmentError(`${student.student_name} için arşivdeki hesap kimliği eşleşmiyor.`);
    selectedEvents.push(saved.record.event_id);
    for (const preference of saved.record.selection.preferences) {
      preferences.push({ student_id: student.id, faculty_id: preference.faculty_id, rank: preference.rank });
    }
  }
  preferences.sort((a, b) => a.student_id - b.student_id || a.rank - b.rank);
  return { preferences, source: { name: input.source_name?.trim() || 'Yüklenen tercih arşivi', mode: 'archive',
    sha256: hash(input.archive_text), selected_students: students.length, preference_count: preferences.length,
    receipt_count: receiptCount, selected_events: selectedEvents } };
}

async function buildPreview(db, input) {
  const state = await readState(db);
  const { preferences, source } = await selectPreferences(db, state, input);
  const students = state.students.filter(s => s.approval_status === 'approved');
  const result = calculateAllocation(students, state.faculty, preferences);
  const facultyMap = new Map(state.faculty.map(f => [f.id, f]));
  const studentMap = new Map(students.map(s => [s.id, s]));
  const priorities = new Map(result.faculty.map(f => [f.id, f.priority]));
  const assignments = result.assignments.map(assignment => {
    const student = studentMap.get(assignment.student_id);
    return { ...assignment, student_name: student.student_name, student_email: student.student_email,
      gano: student.gano, department_id: student.department_id, department_name: student.department_name,
      previous_faculty_id: student.assigned_faculty_id, previous_faculty_name: facultyMap.get(student.assigned_faculty_id)?.faculty_name || null,
      faculty_name: facultyMap.get(assignment.faculty_id)?.faculty_name || null,
      changed: (student.assigned_faculty_id ?? null) !== assignment.faculty_id || Boolean(student.is_assigned) !== (assignment.faculty_id !== null) };
  }).sort((a, b) => a.department_id - b.department_id || (priorities.get(a.faculty_id) ?? Infinity) - (priorities.get(b.faculty_id) ?? Infinity) ||
    (a.method === 'preference' ? 0 : 1) - (b.method === 'preference' ? 0 : 1) || (b.score ?? -Infinity) - (a.score ?? -Infinity) || b.gano - a.gano || a.student_id - b.student_id);
  const fingerprint = hash(JSON.stringify({ rule: 'quota-fill-order-v1', state, preferences, source }));
  return { fingerprint, source, stats: { totalStudents: students.length,
    placedByPreference: assignments.filter(a => a.method === 'preference').length,
    placedRandomly: assignments.filter(a => a.method === 'fallback').length,
    unplaced: assignments.filter(a => a.method === 'unplaced').length,
    changed: assignments.filter(a => a.changed).length },
  faculty: result.faculty.map(f => ({ faculty_id: f.id, faculty_name: f.faculty_name, department_id: f.department_id,
    department_name: f.department_name, priority: f.priority, base_quota: f.base_quota, current_quota: f.current_quota,
    provisional_fill_score: f.provisional_fill_score, provisional_fill_method: f.provisional_fill_method,
    provisional_filled: f.provisional_filled })), assignments };
}

async function previewReassignment(db, input = {}) {
  return db.snapshot(() => buildPreview(db, input))();
}

async function applyReassignment(db, input = {}, actorId = null) {
  if (typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint)) {
    throw new ReassignmentError('Önce yeniden dağıtım önizlemesi oluşturun.');
  }
  return db.transaction(async () => {
    const preview = await buildPreview(db, input);
    if (preview.fingerprint !== input.fingerprint) {
      throw new ReassignmentError('Önizlemeden sonra kayıtlar değişti. Güncel dağıtımı görmek için yeniden önizleme oluşturun.', 409);
    }
    const runId = crypto.randomUUID();
    const updateStudent = db.prepare('UPDATE students SET assigned_faculty_id = ?, is_assigned = ? WHERE id = ?');
    const log = db.prepare('INSERT INTO assignment_logs (student_id, faculty_id, action, details) VALUES (?, ?, ?, ?)');
    for (const assignment of preview.assignments) {
      await updateStudent.run(assignment.faculty_id, assignment.faculty_id === null ? 0 : 1, assignment.student_id);
      await log.run(assignment.student_id, assignment.faculty_id, 'REASSIGN_STUDENT', JSON.stringify({ run_id: runId,
        previous_faculty_id: assignment.previous_faculty_id, faculty_id: assignment.faculty_id,
        method: assignment.method, preference_rank: assignment.preference_rank, score: assignment.score }));
    }
    // Count from student records, including any unchanged non-approved records.
    const counts = await db.prepare('SELECT assigned_faculty_id AS faculty_id, COUNT(*) AS count FROM students WHERE is_assigned = 1 AND assigned_faculty_id IS NOT NULL GROUP BY assigned_faculty_id').all();
    const countMap = new Map(counts.map(row => [row.faculty_id, row.count]));
    const desired = new Map(preview.faculty.map(f => [f.faculty_id, f.base_quota]));
    const allFaculty = await db.prepare('SELECT id FROM faculty ORDER BY id').all();
    const updateFaculty = db.prepare('UPDATE faculty SET base_quota = ?, current_quota = ? WHERE id = ?');
    for (const faculty of allFaculty) {
      const count = countMap.get(faculty.id) || 0;
      await updateFaculty.run(Math.max(desired.get(faculty.id) || 0, count), count, faculty.id);
    }
    for (const faculty of preview.faculty) {
      faculty.current_quota = countMap.get(faculty.faculty_id) || 0;
      faculty.base_quota = Math.max(faculty.base_quota, faculty.current_quota);
    }
    await log.run(null, null, 'REASSIGNMENT_RUN', JSON.stringify({ run_id: runId, actor_id: actorId,
      rule: 'quota-fill-order-v1', fingerprint: preview.fingerprint, source: preview.source,
      stats: preview.stats, faculty: preview.faculty, assignments: preview.assignments }));
    return { ...preview, applied: true, run_id: runId };
  })();
}

module.exports = { ReassignmentError, ARCHIVE_LIMIT, readState, selectPreferences, buildPreview, previewReassignment, applyReassignment };
