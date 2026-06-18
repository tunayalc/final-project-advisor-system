const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, 'assignment_cases');

const DEPARTMENTS = {
  yzvm: { id: 1, name: 'Yapay Zeka ve Veri Mühendisliği' },
  bm: { id: 2, name: 'Bilgisayar Mühendisliği' },
};

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(filePath, rows, headers) {
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function facultyRows(count, department, offset = 0, inactiveIds = new Set()) {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1 + offset;
    return {
      id,
      user_id: 1000 + id,
      department_id: department.id,
      full_name: `${department.id === 1 ? 'YZVM' : 'BM'} Hoca ${String(index + 1).padStart(2, '0')}`,
      email: `hoca${id}@case.local`,
      is_active: inactiveIds.has(id) ? 0 : 1,
    };
  });
}

function studentRows(count, department, options = {}) {
  const {
    offset = 0,
    statusByIndex = () => 'approved',
    assignedByIndex = () => 0,
  } = options;

  return Array.from({ length: count }, (_, index) => {
    const id = index + 1 + offset;
    const gano = Math.max(2.2, 4 - ((index % 90) * 0.02));
    return {
      id,
      user_id: 2000 + id,
      department_id: department.id,
      full_name: `${department.id === 1 ? 'YZVM' : 'BM'} Ogrenci ${String(index + 1).padStart(4, '0')}`,
      email: `ogrenci${id}@case.local`,
      gano: gano.toFixed(2),
      entry_year: 2023 + (index % 2),
      approval_status: statusByIndex(index + 1),
      is_assigned: assignedByIndex(index + 1),
    };
  });
}

function rotateOrder(firstFacultyId, facultyIds) {
  return [
    firstFacultyId,
    ...facultyIds.filter((id) => id !== firstFacultyId),
  ];
}

function preferenceRows(students, facultyIds, firstFacultyForStudent, options = {}) {
  const { allPreferences = true } = options;
  const rows = [];

  students.forEach((student, index) => {
    const firstFacultyId = firstFacultyForStudent(student, index + 1);
    if (!firstFacultyId) {
      return;
    }

    const order = allPreferences ? rotateOrder(firstFacultyId, facultyIds) : [firstFacultyId];
    order.forEach((facultyId, rankIndex) => {
      rows.push({
        student_id: student.id,
        faculty_id: facultyId,
        rank: rankIndex + 1,
      });
    });
  });

  return rows;
}

function distributionString(pairs) {
  return pairs.map(([facultyId, count]) => `${facultyId}:${count}`).join('|');
}

function expectedRows(values) {
  return Object.entries(values).map(([key, value]) => ({ key, value }));
}

function writeCase(name, data) {
  const dir = path.join(ROOT_DIR, name);
  resetDir(dir);

  writeCsv(path.join(dir, 'departments.csv'), data.departments, ['id', 'name']);
  writeCsv(path.join(dir, 'faculty.csv'), data.faculty, ['id', 'user_id', 'department_id', 'full_name', 'email', 'is_active']);
  writeCsv(path.join(dir, 'students.csv'), data.students, [
    'id',
    'user_id',
    'department_id',
    'full_name',
    'email',
    'gano',
    'entry_year',
    'approval_status',
    'is_assigned',
  ]);
  writeCsv(path.join(dir, 'preferences.csv'), data.preferences, ['student_id', 'faculty_id', 'rank']);
  writeCsv(path.join(dir, 'expected_summary.csv'), expectedRows(data.expected), ['key', 'value']);
}

function firstByBuckets(buckets) {
  const expanded = [];
  buckets.forEach(([facultyId, count]) => {
    for (let index = 0; index < count; index += 1) {
      expanded.push(facultyId);
    }
  });
  return (_, index) => expanded[index - 1];
}

function casePopularTwo() {
  const departments = [DEPARTMENTS.yzvm];
  const faculty = facultyRows(4, DEPARTMENTS.yzvm);
  const students = studentRows(22, DEPARTMENTS.yzvm);
  const preferences = preferenceRows(
    students,
    [1, 2, 3, 4],
    firstByBuckets([[1, 7], [2, 7], [3, 4], [4, 4]]),
  );

  writeCase('01_popular_two_advisors', {
    departments,
    faculty,
    students,
    preferences,
    expected: {
      total_students: 22,
      approved_assignable: 22,
      faculty_count: 4,
      expected_assigned: 22,
      expected_unplaced: 0,
      expected_placed_by_preference: 22,
      expected_placed_randomly: 0,
      min_score_logs: 22,
      expected_distribution: distributionString([[1, 6], [2, 6], [3, 5], [4, 5]]),
      require_no_cross_department: true,
      require_no_quota_overflow: true,
      max_runtime_ms: 10000,
    },
  });
}

function caseHappyPath() {
  const departments = [DEPARTMENTS.yzvm];
  const faculty = facultyRows(4, DEPARTMENTS.yzvm);
  const students = studentRows(40, DEPARTMENTS.yzvm);
  const preferences = preferenceRows(
    students,
    [1, 2, 3, 4],
    (_, index) => Math.floor((index - 1) / 10) + 1,
  );

  writeCase('02_happy_path_equal', {
    departments,
    faculty,
    students,
    preferences,
    expected: {
      total_students: 40,
      approved_assignable: 40,
      faculty_count: 4,
      expected_assigned: 40,
      expected_unplaced: 0,
      expected_placed_by_preference: 40,
      expected_placed_randomly: 0,
      min_score_logs: 40,
      expected_distribution: distributionString([[1, 10], [2, 10], [3, 10], [4, 10]]),
      require_no_cross_department: true,
      require_no_quota_overflow: true,
      max_runtime_ms: 10000,
    },
  });
}

function caseYzvmRealistic40() {
  const departments = [DEPARTMENTS.yzvm];
  const faculty = facultyRows(4, DEPARTMENTS.yzvm);
  const students = studentRows(40, DEPARTMENTS.yzvm);
  const preferences = preferenceRows(
    students,
    [1, 2, 3, 4],
    firstByBuckets([[1, 15], [2, 12], [3, 8], [4, 5]]),
  );

  writeCase('03_yzvm_40_realistic', {
    departments,
    faculty,
    students,
    preferences,
    expected: {
      total_students: 40,
      approved_assignable: 40,
      faculty_count: 4,
      expected_assigned: 40,
      expected_unplaced: 0,
      expected_placed_by_preference: 40,
      expected_placed_randomly: 0,
      min_score_logs: 40,
      expected_distribution: distributionString([[1, 10], [2, 10], [3, 10], [4, 10]]),
      require_no_cross_department: true,
      require_no_quota_overflow: true,
      max_runtime_ms: 10000,
    },
  });
}

function caseComputerEngineering110() {
  const departments = [DEPARTMENTS.bm];
  const faculty = facultyRows(10, DEPARTMENTS.bm);
  const students = studentRows(110, DEPARTMENTS.bm);
  const preferences = preferenceRows(
    students,
    Array.from({ length: 10 }, (_, index) => index + 1),
    firstByBuckets([[1, 20], [2, 18], [3, 14], [4, 12], [5, 10], [6, 9], [7, 8], [8, 7], [9, 6], [10, 6]]),
  );

  writeCase('04_computer_engineering_110', {
    departments,
    faculty,
    students,
    preferences,
    expected: {
      total_students: 110,
      approved_assignable: 110,
      faculty_count: 10,
      expected_assigned: 110,
      expected_unplaced: 0,
      expected_placed_by_preference: 110,
      expected_placed_randomly: 0,
      min_score_logs: 110,
      expected_distribution: distributionString(Array.from({ length: 10 }, (_, index) => [index + 1, 11])),
      require_no_cross_department: true,
      require_no_quota_overflow: true,
      max_runtime_ms: 15000,
    },
  });
}

function caseCapacity(studentCount, facultyCount) {
  const departments = [DEPARTMENTS.yzvm];
  const faculty = facultyRows(facultyCount, DEPARTMENTS.yzvm);
  const students = studentRows(studentCount, DEPARTMENTS.yzvm);
  const preferences = preferenceRows(
    students,
    Array.from({ length: facultyCount }, (_, index) => index + 1),
    (_, index) => ((index - 1) % facultyCount) + 1,
    { allPreferences: false },
  );
  const expectedPerFaculty = studentCount / facultyCount;

  writeCase(`05_capacity_${studentCount}`, {
    departments,
    faculty,
    students,
    preferences,
    expected: {
      total_students: studentCount,
      approved_assignable: studentCount,
      faculty_count: facultyCount,
      expected_assigned: studentCount,
      expected_unplaced: 0,
      expected_placed_by_preference: studentCount,
      expected_placed_randomly: 0,
      min_score_logs: studentCount,
      expected_distribution: distributionString(Array.from({ length: facultyCount }, (_, index) => [index + 1, expectedPerFaculty])),
      require_no_cross_department: true,
      require_no_quota_overflow: true,
      max_runtime_ms: studentCount >= 5000 ? 60000 : 20000,
    },
  });
}

function edgePendingRejected() {
  const departments = [DEPARTMENTS.yzvm];
  const faculty = facultyRows(2, DEPARTMENTS.yzvm);
  const students = studentRows(4, DEPARTMENTS.yzvm, {
    statusByIndex: (index) => (index === 2 ? 'pending' : index === 3 ? 'rejected' : 'approved'),
  });
  const preferences = preferenceRows(students, [1, 2], (_, index) => (index <= 2 ? 1 : 2));

  writeCase('edge_pending_rejected', {
    departments,
    faculty,
    students,
    preferences,
    expected: {
      total_students: 4,
      approved_assignable: 2,
      faculty_count: 2,
      expected_assigned: 2,
      expected_unplaced: 0,
      expected_placed_by_preference: 2,
      expected_placed_randomly: 0,
      min_score_logs: 2,
      expected_distribution: distributionString([[1, 1], [2, 1]]),
      require_no_cross_department: true,
      require_no_quota_overflow: true,
      max_runtime_ms: 10000,
    },
  });
}

function edgeInactiveFaculty() {
  const departments = [DEPARTMENTS.yzvm];
  const faculty = facultyRows(2, DEPARTMENTS.yzvm, 0, new Set([1]));
  const students = studentRows(4, DEPARTMENTS.yzvm);
  const preferences = [];
  students.forEach((student) => {
    preferences.push({ student_id: student.id, faculty_id: 1, rank: 1 });
    preferences.push({ student_id: student.id, faculty_id: 2, rank: 2 });
  });

  writeCase('edge_inactive_faculty', {
    departments,
    faculty,
    students,
    preferences,
    expected: {
      total_students: 4,
      approved_assignable: 4,
      faculty_count: 2,
      expected_assigned: 4,
      expected_unplaced: 0,
      expected_placed_by_preference: 4,
      expected_placed_randomly: 0,
      min_score_logs: 4,
      expected_distribution: distributionString([[2, 4]]),
      require_no_cross_department: true,
      require_no_quota_overflow: true,
      max_runtime_ms: 10000,
    },
  });
}

function edgeFallback() {
  const departments = [DEPARTMENTS.yzvm];
  const faculty = facultyRows(2, DEPARTMENTS.yzvm);
  const students = studentRows(4, DEPARTMENTS.yzvm);
  const preferences = [
    { student_id: 1, faculty_id: 1, rank: 1 },
    { student_id: 2, faculty_id: 1, rank: 1 },
  ];

  writeCase('edge_fallback', {
    departments,
    faculty,
    students,
    preferences,
    expected: {
      total_students: 4,
      approved_assignable: 4,
      faculty_count: 2,
      expected_assigned: 4,
      expected_unplaced: 0,
      expected_placed_by_preference: 2,
      expected_placed_randomly: 2,
      min_score_logs: 2,
      expected_distribution: distributionString([[1, 2], [2, 2]]),
      require_no_cross_department: true,
      require_no_quota_overflow: true,
      max_runtime_ms: 10000,
    },
  });
}

function edgeTieBreak() {
  const departments = [DEPARTMENTS.yzvm];
  const faculty = facultyRows(2, DEPARTMENTS.yzvm);
  const students = studentRows(2, DEPARTMENTS.yzvm).map((student) => ({
    ...student,
    gano: '3.50',
  }));
  const preferences = [
    { student_id: 1, faculty_id: 1, rank: 1 },
    { student_id: 2, faculty_id: 1, rank: 1 },
  ];

  writeCase('edge_tie_break', {
    departments,
    faculty,
    students,
    preferences,
    expected: {
      total_students: 2,
      approved_assignable: 2,
      faculty_count: 2,
      expected_assigned: 2,
      expected_unplaced: 0,
      expected_placed_by_preference: 1,
      expected_placed_randomly: 1,
      min_score_logs: 1,
      expected_distribution: distributionString([[1, 1], [2, 1]]),
      expected_student_assignments: '1:1|2:2',
      require_no_cross_department: true,
      require_no_quota_overflow: true,
      max_runtime_ms: 10000,
    },
  });
}

function edgeMultiDepartmentIsolation() {
  const departments = [DEPARTMENTS.yzvm, DEPARTMENTS.bm];
  const faculty = [
    ...facultyRows(2, DEPARTMENTS.yzvm),
    ...facultyRows(2, DEPARTMENTS.bm, 2),
  ];
  const students = [
    ...studentRows(4, DEPARTMENTS.yzvm),
    ...studentRows(6, DEPARTMENTS.bm, { offset: 4 }),
  ];
  const preferences = [];
  students.forEach((student) => {
    if (student.department_id === 1) {
      preferences.push({ student_id: student.id, faculty_id: 3, rank: 1 });
      preferences.push({ student_id: student.id, faculty_id: ((student.id - 1) % 2) + 1, rank: 2 });
      return;
    }

    preferences.push({ student_id: student.id, faculty_id: 1, rank: 1 });
    preferences.push({ student_id: student.id, faculty_id: 3 + ((student.id - 5) % 2), rank: 2 });
  });

  writeCase('edge_multi_department_isolation', {
    departments,
    faculty,
    students,
    preferences,
    expected: {
      total_students: 10,
      approved_assignable: 10,
      faculty_count: 4,
      expected_assigned: 10,
      expected_unplaced: 0,
      expected_placed_by_preference: 10,
      expected_placed_randomly: 0,
      min_score_logs: 10,
      expected_distribution: distributionString([[1, 2], [2, 2], [3, 3], [4, 3]]),
      require_no_cross_department: true,
      require_no_quota_overflow: true,
      max_runtime_ms: 10000,
    },
  });
}

function main() {
  resetDir(ROOT_DIR);
  casePopularTwo();
  caseHappyPath();
  caseYzvmRealistic40();
  caseComputerEngineering110();
  caseCapacity(100, 10);
  caseCapacity(500, 25);
  caseCapacity(1000, 50);
  caseCapacity(5000, 100);
  edgePendingRejected();
  edgeInactiveFaculty();
  edgeFallback();
  edgeTieBreak();
  edgeMultiDepartmentIsolation();
  console.log(`Assignment case CSV files generated in ${ROOT_DIR}`);
}

main();
