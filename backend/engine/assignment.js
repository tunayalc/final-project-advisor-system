const { getDb } = require('../db/database');

function calculateTargetQuotas(facultyList, totalTarget) {
  const sortedFaculty = [...facultyList].sort((left, right) => left.id - right.id);
  const quotaMap = {};

  if (sortedFaculty.length === 0) {
    return quotaMap;
  }

  sortedFaculty.forEach((faculty) => {
    quotaMap[faculty.id] = faculty.current_quota;
  });

  let remaining = totalTarget - sortedFaculty.reduce((sum, faculty) => sum + faculty.current_quota, 0);

  while (remaining > 0) {
    const ranked = [...sortedFaculty].sort((left, right) => {
      if (quotaMap[left.id] !== quotaMap[right.id]) {
        return quotaMap[left.id] - quotaMap[right.id];
      }
      return left.id - right.id;
    });

    for (const faculty of ranked) {
      if (remaining === 0) {
        break;
      }
      quotaMap[faculty.id] += 1;
      remaining -= 1;
    }
  }

  return quotaMap;
}

async function calculateQuotas() {
  return getDb().transaction(calculateQuotasInternal)();
}

async function calculateQuotasInternal() {
  const db = getDb();
  const activeFaculty = await db.prepare('SELECT id, department_id, current_quota FROM faculty WHERE is_active = 1 ORDER BY department_id ASC, id ASC').all();
  const inactiveFaculty = await db.prepare('SELECT id, current_quota FROM faculty WHERE is_active = 0').all();
  const unassignedByDepartment = await db.prepare(`
        SELECT department_id, COUNT(*) as c
        FROM students
        WHERE is_assigned = 0 AND approval_status = 'approved'
        GROUP BY department_id
    `).all();
  const unassignedMap = new Map(
    unassignedByDepartment.map((row) => [row.department_id, row.c])
  );
  const currentAssignments = activeFaculty.reduce((sum, faculty) => sum + faculty.current_quota, 0);
  const unassignedStudents = unassignedByDepartment.reduce((sum, row) => sum + row.c, 0);
  const managedStudents = currentAssignments + unassignedStudents;

  if (activeFaculty.length === 0) {
    return { error: 'Kontenjan hesaplamak için en az bir aktif danışman gerekli.' };
  }

  const departments = [...new Set(activeFaculty.map((faculty) => faculty.department_id))];
  const quotaMap = {};

  departments.forEach((departmentId) => {
    const departmentFaculty = activeFaculty.filter((faculty) => faculty.department_id === departmentId);
    const departmentAssignments = departmentFaculty.reduce((sum, faculty) => sum + faculty.current_quota, 0);
    const departmentUnassigned = unassignedMap.get(departmentId) || 0;
    const departmentTarget = departmentAssignments + departmentUnassigned;
    Object.assign(quotaMap, calculateTargetQuotas(departmentFaculty, departmentTarget));
  });

  const updateQuota = db.prepare('UPDATE faculty SET base_quota = ? WHERE id = ?');

  await db.transaction(async () => {for (const
    faculty of activeFaculty) {
      await updateQuota.run(quotaMap[faculty.id] || faculty.current_quota, faculty.id);
    }for (const

    faculty of inactiveFaculty) {
      await updateQuota.run(faculty.current_quota, faculty.id);
    }
  })();

  return {
    message: 'Kontenjanlar aktif danışmanlara dengeli şekilde dağıtıldı.',
    totalStudents: managedStudents,
    unassignedStudents,
    totalFaculty: activeFaculty.length,
    quotas: activeFaculty.map((faculty) => ({
      faculty_id: faculty.id,
      base_quota: quotaMap[faculty.id] || faculty.current_quota,
      current_quota: faculty.current_quota
    }))
  };
}

function calculatePreferenceScore(rank, preferenceCount) {
  if (preferenceCount <= 1) {
    return 100;
  }

  return (preferenceCount - rank) / (preferenceCount - 1) * 100;
}

function roundScore(value) {
  return Math.round(value * 100) / 100;
}

async function runAssignment() {
  const db = getDb();

  const stats = {
    totalStudents: 0,
    placedByPreference: 0,
    placedRandomly: 0,
    unplaced: 0
  };

  const transaction = db.transaction(async () => {
    const students = await db.prepare(`
            SELECT id, gano, department_id
            FROM students
            WHERE is_assigned = 0 AND approval_status = 'approved'
            ORDER BY department_id ASC, gano DESC, id ASC
        `).all();
    stats.totalStudents = students.length;

    if (students.length === 0) return stats;

    // Fetch quotas only for active faculty
    const facultyList = await db.prepare('SELECT id, department_id, base_quota, current_quota FROM faculty WHERE is_active = 1').all();
    if (facultyList.length === 0) {
      stats.unplaced = students.length;
      return stats;
    }

    // Create a quota map
    const quotas = {};
    facultyList.forEach((f) => {
      quotas[f.id] = { base: f.base_quota, current: f.current_quota, department_id: f.department_id };
    });

    const updateStudent = db.prepare('UPDATE students SET is_assigned = 1, assigned_faculty_id = ? WHERE id = ?');
    const studentMap = new Map(students.map((student) => [student.id, student]));
    const assignedStudents = new Set();
    const preferenceRows = await db.prepare(`
            SELECT
                p.student_id,
                p.faculty_id,
                p.rank,
                COUNT(*) OVER (PARTITION BY p.student_id) as preference_count
            FROM preferences p
            JOIN students s ON s.id = p.student_id
            JOIN faculty f ON f.id = p.faculty_id
            WHERE
                s.is_assigned = 0
                AND s.approval_status = 'approved'
                AND f.is_active = 1
                AND f.department_id = s.department_id
            ORDER BY p.student_id ASC, p.rank ASC
        `).all();

    const scoredCandidates = preferenceRows.
    filter((preference) => studentMap.has(preference.student_id) && quotas[preference.faculty_id]).
    map((preference) => {
      const student = studentMap.get(preference.student_id);
      const ganoScore = student.gano / 4 * 100;
      const preferenceScore = calculatePreferenceScore(preference.rank, preference.preference_count);
      const ganoContribution = ganoScore * 0.8;
      const preferenceContribution = preferenceScore * 0.2;
      const totalScore = ganoContribution + preferenceContribution;

      return {
        student_id: preference.student_id,
        faculty_id: preference.faculty_id,
        rank: preference.rank,
        gano: student.gano,
        totalScore: roundScore(totalScore),
        rawTotalScore: totalScore,
        ganoContribution: roundScore(ganoContribution),
        preferenceContribution: roundScore(preferenceContribution)
      };
    }).
    sort((left, right) => {
      if (left.rawTotalScore !== right.rawTotalScore) {
        return right.rawTotalScore - left.rawTotalScore;
      }

      if (left.gano !== right.gano) {
        return right.gano - left.gano;
      }

      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      if (left.student_id !== right.student_id) {
        return left.student_id - right.student_id;
      }

      return left.faculty_id - right.faculty_id;
    });

    for (const candidate of scoredCandidates) {
      if (assignedStudents.has(candidate.student_id)) {
        continue;
      }

      const student = studentMap.get(candidate.student_id);
      const quota = quotas[candidate.faculty_id];

      if (!student || !quota || quota.department_id !== student.department_id || quota.current >= quota.base) {
        continue;
      }

      quota.current += 1;
      assignedStudents.add(candidate.student_id);
      await updateStudent.run(candidate.faculty_id, candidate.student_id);
      stats.placedByPreference++;

      await db.prepare('INSERT INTO assignment_logs (student_id, faculty_id, action, details) VALUES (?, ?, ?, ?)').
      run(
        candidate.student_id,
        candidate.faculty_id,
        'SCORE_ASSIGN',
        `Puan: ${candidate.totalScore.toFixed(2)} | GANO katkısı: ${candidate.ganoContribution.toFixed(2)} | Tercih katkısı: ${candidate.preferenceContribution.toFixed(2)} | Tercih sırası: ${candidate.rank}`
      );
    }

    for (const student of students) {
      if (assignedStudents.has(student.id)) {
        continue;
      }

      // Fallback among active faculty with the highest remaining quota.
      const emptyFaculty = Object.entries(quotas).
      filter(([, quota]) => quota.department_id === student.department_id && quota.current < quota.base).
      sort((left, right) => {
        const leftRemaining = left[1].base - left[1].current;
        const rightRemaining = right[1].base - right[1].current;

        if (leftRemaining !== rightRemaining) {
          return rightRemaining - leftRemaining;
        }

        if (left[1].current !== right[1].current) {
          return left[1].current - right[1].current;
        }

        return parseInt(left[0], 10) - parseInt(right[0], 10);
      })[0];

      if (emptyFaculty) {
        const fid = parseInt(emptyFaculty[0], 10);
        quotas[fid].current += 1;
        await updateStudent.run(fid, student.id);
        assignedStudents.add(student.id);
        stats.placedRandomly++;

        await db.prepare('INSERT INTO assignment_logs (student_id, faculty_id, action, details) VALUES (?, ?, ?, ?)').
        run(student.id, fid, 'FALLBACK_ASSIGN', 'Boş kontenjana yerleştirildi (GANO: ' + student.gano + ')');
      } else {
        stats.unplaced++;
      }
    }

    // Update DB quotas
    const updateQuota = db.prepare('UPDATE faculty SET current_quota = ? WHERE id = ?');
    for (const [fid, q] of Object.entries(quotas)) {
      await updateQuota.run(q.current, fid);
    }
  });

  await transaction();
  return stats;
}

async function runSimulation() {
  console.log("Simülasyon başlatılıyor...");
  const quotas = await calculateQuotas();
  console.log(quotas);
  const results = await runAssignment();
  console.log("Atama Sonuçları: ", results);
}

module.exports = {
  calculateQuotas,
  runAssignment,
  runSimulation
};
