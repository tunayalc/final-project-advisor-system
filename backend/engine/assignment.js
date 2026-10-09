const { getDb } = require('../db/database');
const { allocate, calculateAllocation } = require('./allocation');

async function calculateQuotas() {
  const db = getDb();
  return db.transaction(async () => {
    const students = await db.prepare("SELECT id, gano, department_id, is_assigned FROM students WHERE approval_status = 'approved' ORDER BY id").all();
    const faculty = await db.prepare('SELECT id, department_id, is_active, current_quota FROM faculty ORDER BY id').all();
    const preferences = await db.prepare('SELECT student_id, faculty_id, rank FROM preferences ORDER BY student_id, rank').all();
    if (!faculty.some(f => f.is_active === 1)) return { error: 'Kontenjan hesaplamak için en az bir aktif danışman gerekli.' };
    const result = calculateAllocation(students, faculty, preferences);
    const update = db.prepare('UPDATE faculty SET base_quota = ? WHERE id = ?');
    const quotas = [];
    for (const teacher of faculty) {
      // The legacy initial-assignment action preserves existing/manual placements.
      const base = Math.max(result.quotas[teacher.id] || 0, teacher.current_quota);
      await update.run(base, teacher.id);
      if (teacher.is_active === 1) quotas.push({ faculty_id: teacher.id, base_quota: base, current_quota: teacher.current_quota });
    }
    return { message: 'Ek kontenjanlar eşit kontenjanını puanlı yerleştirmede önce dolduran danışmanlara verildi.',
      totalStudents: students.length, unassignedStudents: students.filter(s => !s.is_assigned).length,
      totalFaculty: quotas.length, quotas };
  })();
}

async function runAssignment() {
  const db = getDb();
  return db.transaction(async () => {
    const students = await db.prepare("SELECT id, gano, department_id FROM students WHERE is_assigned = 0 AND approval_status = 'approved' ORDER BY department_id, gano DESC, id").all();
    const faculty = await db.prepare('SELECT id, department_id, base_quota, current_quota FROM faculty WHERE is_active = 1').all();
    const preferences = await db.prepare('SELECT student_id, faculty_id, rank FROM preferences ORDER BY student_id, rank').all();
    const result = allocate(students, faculty, preferences,
      Object.fromEntries(faculty.map(f => [f.id, f.base_quota])), Object.fromEntries(faculty.map(f => [f.id, f.current_quota])));
    const update = db.prepare('UPDATE students SET is_assigned = 1, assigned_faculty_id = ? WHERE id = ?');
    const studentMap = new Map(students.map(student => [student.id, student]));
    const log = db.prepare('INSERT INTO assignment_logs (student_id, faculty_id, action, details) VALUES (?, ?, ?, ?)');
    for (const assignment of result.assignments) {
      if (assignment.method === 'unplaced') continue;
      await update.run(assignment.faculty_id, assignment.student_id);
      await log.run(assignment.student_id, assignment.faculty_id,
        assignment.method === 'preference' ? 'SCORE_ASSIGN' : 'FALLBACK_ASSIGN',
        assignment.method === 'preference'
          ? `Puan: ${assignment.score.toFixed(2)} | GANO katkısı: ${assignment.gano_contribution.toFixed(2)} | Tercih katkısı: ${assignment.preference_contribution.toFixed(2)} | Tercih sırası: ${assignment.preference_rank}`
          : `Boş kontenjana yerleştirildi (GANO: ${studentMap.get(assignment.student_id).gano})`);
    }
    const quotaUpdate = db.prepare('UPDATE faculty SET current_quota = ? WHERE id = ?');
    for (const [id, count] of Object.entries(result.counts)) await quotaUpdate.run(count, Number(id));
    return { totalStudents: students.length, placedByPreference: result.assignments.filter(a => a.method === 'preference').length,
      placedRandomly: result.assignments.filter(a => a.method === 'fallback').length,
      unplaced: result.assignments.filter(a => a.method === 'unplaced').length };
  })();
}

async function runSimulation() {
  console.log(await calculateQuotas());
  console.log(await runAssignment());
}

module.exports = { calculateQuotas, runAssignment, runSimulation };
