// Pure allocation rules shared by the initial assignment and the full rerun.
function calculatePreferenceScore(rank, count) {
  return count <= 1 ? 100 : (count - rank) / (count - 1) * 100;
}

const roundScore = value => Math.round(value * 100) / 100;
const studentOrder = (a, b) => a.department_id - b.department_id || b.gano - a.gano || a.id - b.id;

function scoreCandidates(students, faculty, preferences) {
  const studentMap = new Map(students.map(s => [s.id, s]));
  const facultyMap = new Map(faculty.map(f => [f.id, f]));
  const valid = preferences.filter(p => {
    const s = studentMap.get(p.student_id);
    const f = facultyMap.get(p.faculty_id);
    return s && f && f.department_id === s.department_id;
  });
  const counts = new Map();
  for (const p of valid) counts.set(p.student_id, (counts.get(p.student_id) || 0) + 1);
  return valid.map(p => {
    const s = studentMap.get(p.student_id);
    const ganoContribution = s.gano / 4 * 100 * 0.8;
    const preferenceContribution = calculatePreferenceScore(p.rank, counts.get(s.id)) * 0.2;
    const rawTotalScore = ganoContribution + preferenceContribution;
    return { student_id: s.id, faculty_id: p.faculty_id, rank: p.rank, gano: s.gano,
      rawTotalScore, totalScore: roundScore(rawTotalScore),
      ganoContribution: roundScore(ganoContribution), preferenceContribution: roundScore(preferenceContribution) };
  }).sort((a, b) => b.rawTotalScore - a.rawTotalScore || b.gano - a.gano || a.rank - b.rank ||
    a.student_id - b.student_id || a.faculty_id - b.faculty_id);
}

function allocate(students, faculty, preferences, capacities, initialCounts = {}) {
  const quotas = new Map(faculty.map(f => [f.id, { ...f, base: capacities[f.id] || 0, current: initialCounts[f.id] || 0 }]));
  const assignments = new Map();
  const fillOrder = [];
  function place(studentId, facultyId, candidate) {
    const quota = quotas.get(facultyId);
    quota.current++;
    const assignment = { student_id: studentId, faculty_id: facultyId,
      preference_rank: candidate?.rank ?? null, score: candidate?.totalScore ?? null,
      gano_contribution: candidate?.ganoContribution ?? null,
      preference_contribution: candidate?.preferenceContribution ?? null,
      method: candidate ? 'preference' : 'fallback' };
    assignments.set(studentId, assignment);
    if (quota.current === quota.base) fillOrder.push({ faculty_id: facultyId, score: assignment.score, method: assignment.method });
  }
  for (const candidate of scoreCandidates(students, faculty, preferences)) {
    const quota = quotas.get(candidate.faculty_id);
    if (!assignments.has(candidate.student_id) && quota.current < quota.base) place(candidate.student_id, candidate.faculty_id, candidate);
  }
  for (const student of [...students].sort(studentOrder)) {
    if (assignments.has(student.id)) continue;
    const available = [...quotas.values()].filter(q => q.department_id === student.department_id && q.current < q.base)
      .sort((a, b) => (b.base - b.current) - (a.base - a.current) || a.current - b.current || a.id - b.id)[0];
    if (available) place(student.id, available.id);
    else assignments.set(student.id, { student_id: student.id, faculty_id: null, preference_rank: null, score: null, method: 'unplaced' });
  }
  return { assignments: [...assignments.values()], fillOrder, counts: Object.fromEntries([...quotas].map(([id, q]) => [id, q.current])) };
}

function calculateAllocation(students, faculty, preferences) {
  const active = faculty.filter(f => f.is_active === 1);
  const departmentIds = [...new Set([...students, ...active].map(row => row.department_id))].sort((a, b) => a - b);
  const rankedFaculty = [];
  const quotas = {};
  for (const departmentId of departmentIds) {
    const members = students.filter(s => s.department_id === departmentId);
    const teachers = active.filter(f => f.department_id === departmentId).sort((a, b) => a.id - b.id);
    if (!teachers.length) continue;
    const common = Math.floor(members.length / teachers.length);
    const extra = members.length % teachers.length;
    const provisional = allocate(members, teachers, preferences,
      Object.fromEntries(teachers.map(f => [f.id, members.length ? Math.max(common, 1) : 0])));
    const fills = new Map(provisional.fillOrder.map((f, index) => [f.faculty_id, { ...f, position: index }]));
    teachers.sort((a, b) => (fills.get(a.id)?.position ?? Infinity) - (fills.get(b.id)?.position ?? Infinity) || a.id - b.id);
    teachers.forEach((teacher, index) => {
      quotas[teacher.id] = common + (index < extra ? 1 : 0);
      rankedFaculty.push({ ...teacher, priority: index + 1, base_quota: quotas[teacher.id],
        provisional_fill_score: fills.get(teacher.id)?.score ?? null,
        provisional_fill_method: fills.get(teacher.id)?.method ?? null,
        provisional_filled: fills.has(teacher.id) });
    });
  }
  const result = allocate(students, active, preferences, quotas);
  return { ...result, quotas, faculty: rankedFaculty.map(f => ({ ...f, current_quota: result.counts[f.id] || 0 })) };
}

module.exports = { calculatePreferenceScore, roundScore, scoreCandidates, allocate, calculateAllocation };
