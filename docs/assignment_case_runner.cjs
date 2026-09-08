const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const CASES_DIR = path.resolve(__dirname, 'assignment_cases');

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) {
    return [];
  }

  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines
    .filter(Boolean)
    .map((line) => {
      const values = parseCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    });
}

function readExpected(caseDir) {
  return Object.fromEntries(
    readCsv(path.join(caseDir, 'expected_summary.csv')).map((row) => [row.key, row.value]),
  );
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFloat(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBool(value) {
  return String(value).toLowerCase() === 'true';
}

function parsePairs(value) {
  if (!value) {
    return new Map();
  }

  return new Map(
    String(value)
      .split('|')
      .filter(Boolean)
      .map((pair) => {
        const [left, right] = pair.split(':');
        return [toInt(left), toInt(right)];
      }),
  );
}

function listCases() {
  if (!fs.existsSync(CASES_DIR)) {
    return [];
  }

  return fs.readdirSync(CASES_DIR)
    .filter((entry) => fs.existsSync(path.join(CASES_DIR, entry, 'expected_summary.csv')))
    .sort();
}

function loadCase(caseName) {
  const caseDir = path.join(CASES_DIR, caseName);
  if (!fs.existsSync(caseDir)) {
    throw new Error(`Case not found: ${caseName}`);
  }

  return {
    name: caseName,
    dir: caseDir,
    departments: readCsv(path.join(caseDir, 'departments.csv')),
    faculty: readCsv(path.join(caseDir, 'faculty.csv')),
    students: readCsv(path.join(caseDir, 'students.csv')),
    preferences: readCsv(path.join(caseDir, 'preferences.csv')),
    expected: readExpected(caseDir),
  };
}

function loadBackendForDb(dbPath, quiet) {
  process.env.DB_PATH = dbPath;
  process.env.JWT_SECRET = 'assignment-case-runner-secret-isolated';
  process.env.ADMIN_PASSWORD = 'AssignmentTest1234!';

  const originalLog = console.log;
  if (quiet) {
    console.log = () => {};
  }

  const { getDb } = require(path.join(ROOT_DIR, 'backend', 'db', 'sqlite'));
  const engine = require(path.join(ROOT_DIR, 'backend', 'engine', 'assignment'));
  const db = getDb();

  if (quiet) {
    console.log = originalLog;
  }

  return { db, engine };
}

function resetDb(db) {
  db.pragma('foreign_keys = OFF');
  [
    'assignment_logs',
    'preferences',
    'pre_assignments',
    'students',
    'faculty',
    'users',
    'departments',
  ].forEach((tableName) => {
    db.prepare(`DELETE FROM ${tableName}`).run();
  });
  db.pragma('foreign_keys = ON');
}

function insertCaseData(db, data) {
  const insertDepartment = db.prepare('INSERT INTO departments (id, name) VALUES (?, ?)');
  const insertUser = db.prepare('INSERT INTO users (id, email, password_hash, role, full_name) VALUES (?, ?, ?, ?, ?)');
  const insertFaculty = db.prepare(`
    INSERT INTO faculty (id, user_id, department_id, expertise_keywords, is_active, base_quota, current_quota)
    VALUES (?, ?, ?, '', ?, 0, 0)
  `);
  const insertStudent = db.prepare(`
    INSERT INTO students (
      id,
      user_id,
      gano,
      department_id,
      entry_year,
      approval_status,
      transcript_full_name,
      transcript_warning,
      is_assigned,
      assigned_faculty_id
    ) VALUES (?, ?, ?, ?, ?, ?, '', '', ?, NULL)
  `);
  const insertPreference = db.prepare('INSERT INTO preferences (student_id, faculty_id, rank) VALUES (?, ?, ?)');

  db.transaction(() => {
    data.departments.forEach((department) => {
      insertDepartment.run(toInt(department.id), department.name);
    });

    data.faculty.forEach((faculty) => {
      insertUser.run(
        toInt(faculty.user_id),
        faculty.email,
        'case-password-hash',
        'hoca',
        faculty.full_name,
      );
      insertFaculty.run(
        toInt(faculty.id),
        toInt(faculty.user_id),
        toInt(faculty.department_id),
        toInt(faculty.is_active, 1),
      );
    });

    data.students.forEach((student) => {
      insertUser.run(
        toInt(student.user_id),
        student.email,
        'case-password-hash',
        'ogrenci',
        student.full_name,
      );
      insertStudent.run(
        toInt(student.id),
        toInt(student.user_id),
        toFloat(student.gano),
        toInt(student.department_id),
        toInt(student.entry_year),
        student.approval_status || 'approved',
        toInt(student.is_assigned),
      );
    });

    data.preferences.forEach((preference) => {
      insertPreference.run(
        toInt(preference.student_id),
        toInt(preference.faculty_id),
        toInt(preference.rank),
      );
    });
  })();
}

function distribution(db) {
  return new Map(
    db.prepare(`
      SELECT assigned_faculty_id as faculty_id, COUNT(*) as count
      FROM students
      WHERE is_assigned = 1 AND assigned_faculty_id IS NOT NULL
      GROUP BY assigned_faculty_id
      ORDER BY assigned_faculty_id ASC
    `).all().map((row) => [row.faculty_id, row.count]),
  );
}

function studentAssignments(db) {
  return new Map(
    db.prepare(`
      SELECT id, assigned_faculty_id
      FROM students
      WHERE is_assigned = 1
      ORDER BY id ASC
    `).all().map((row) => [row.id, row.assigned_faculty_id]),
  );
}

function compareMap(name, actual, expected, failures) {
  for (const [id, expectedCount] of expected.entries()) {
    const actualCount = actual.get(id) || 0;
    if (actualCount !== expectedCount) {
      failures.push(`${name} mismatch for ${id}: expected ${expectedCount}, got ${actualCount}`);
    }
  }
}

function invariantChecks(db, data, stats, durationMs) {
  const failures = [];
  const warnings = [];
  const expected = data.expected;
  const expectedDistribution = parsePairs(expected.expected_distribution);
  const expectedAssignments = parsePairs(expected.expected_student_assignments);
  const actualDistribution = distribution(db);
  const actualAssignments = studentAssignments(db);
  const assignedCount = db.prepare('SELECT COUNT(*) as count FROM students WHERE is_assigned = 1').get().count;
  const scoreLogs = db.prepare("SELECT COUNT(*) as count FROM assignment_logs WHERE action = 'SCORE_ASSIGN'").get().count;
  const fallbackLogs = db.prepare("SELECT COUNT(*) as count FROM assignment_logs WHERE action = 'FALLBACK_ASSIGN'").get().count;
  const crossDepartment = db.prepare(`
    SELECT COUNT(*) as count
    FROM students s
    JOIN faculty f ON f.id = s.assigned_faculty_id
    WHERE s.is_assigned = 1 AND s.department_id <> f.department_id
  `).get().count;
  const quotaOverflow = db.prepare(`
    SELECT COUNT(*) as count
    FROM faculty
    WHERE current_quota > base_quota
  `).get().count;

  const checks = [
    ['approved_assignable', stats.totalStudents],
    ['expected_assigned', assignedCount],
    ['expected_unplaced', stats.unplaced],
    ['expected_placed_by_preference', stats.placedByPreference],
    ['expected_placed_randomly', stats.placedRandomly],
  ];

  checks.forEach(([key, actual]) => {
    if (expected[key] !== undefined && toInt(expected[key]) !== actual) {
      failures.push(`${key}: expected ${expected[key]}, got ${actual}`);
    }
  });

  if (expected.min_score_logs !== undefined && scoreLogs < toInt(expected.min_score_logs)) {
    failures.push(`min_score_logs: expected at least ${expected.min_score_logs}, got ${scoreLogs}`);
  }

  if (expected.expected_placed_randomly !== undefined && fallbackLogs !== toInt(expected.expected_placed_randomly)) {
    failures.push(`fallback log count: expected ${expected.expected_placed_randomly}, got ${fallbackLogs}`);
  }

  if (expectedDistribution.size > 0) {
    compareMap('distribution', actualDistribution, expectedDistribution, failures);
  }

  if (expectedAssignments.size > 0) {
    compareMap('student assignment', actualAssignments, expectedAssignments, failures);
  }

  if (parseBool(expected.require_no_cross_department) && crossDepartment !== 0) {
    failures.push(`cross department assignments found: ${crossDepartment}`);
  }

  if (parseBool(expected.require_no_quota_overflow) && quotaOverflow !== 0) {
    failures.push(`quota overflow rows found: ${quotaOverflow}`);
  }

  if (expected.max_runtime_ms !== undefined && durationMs > toInt(expected.max_runtime_ms)) {
    warnings.push(`runtime warning: ${durationMs}ms exceeded ${expected.max_runtime_ms}ms`);
  }

  return {
    failures,
    warnings,
    summary: {
      totalStudents: data.students.length,
      facultyCount: data.faculty.length,
      assignedCount,
      scoreLogs,
      fallbackLogs,
      crossDepartment,
      quotaOverflow,
      distribution: Object.fromEntries(actualDistribution.entries()),
      durationMs,
      stats,
    },
  };
}

async function runCase(caseName, options = {}) {
  const data = loadCase(caseName);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `assignment-case-${caseName}-`));
  const dbPath = path.join(tempDir, 'case.db');
  let caseDb;

  try {
    const { db, engine } = loadBackendForDb(dbPath, options.json);
    caseDb = db;
    resetDb(db);
    insertCaseData(db, data);

    await engine.calculateQuotas();
    const startedAt = Date.now();
    const stats = await engine.runAssignment();
    const durationMs = Date.now() - startedAt;
    const checks = invariantChecks(db, data, stats, durationMs);
    const status = checks.failures.length === 0 ? 'PASS' : 'FAIL';

    return {
      case: caseName,
      status,
      ...checks,
    };
  } finally {
    caseDb?.close();
    if (path.dirname(path.resolve(tempDir)) !== path.resolve(os.tmpdir()) || !path.basename(tempDir).startsWith('assignment-case-')) {
      throw new Error('Unexpected test cleanup directory.');
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function runAll(options = {}) {
  return listCases().map((caseName) => {
    const child = spawnSync(process.execPath, [__filename, '--case', caseName, '--json'], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
    });

    if (child.status !== 0 && !child.stdout.trim()) {
      return {
        case: caseName,
        status: 'FAIL',
        failures: [child.stderr || `child exited with ${child.status}`],
        warnings: [],
        summary: {},
      };
    }

    try {
      return JSON.parse(child.stdout);
    } catch (error) {
      return {
        case: caseName,
        status: 'FAIL',
        failures: [`Could not parse child output: ${error.message}`, child.stdout, child.stderr].filter(Boolean),
        warnings: [],
        summary: {},
      };
    }
  });
}

function parseArgs(argv) {
  const args = {
    all: false,
    json: false,
    caseName: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--all') {
      args.all = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--case') {
      args.caseName = argv[index + 1] || '';
      index += 1;
    }
  }

  return args;
}

function printHuman(results) {
  const list = Array.isArray(results) ? results : [results];
  list.forEach((result) => {
    const icon = result.status === 'PASS' ? 'PASS' : 'FAIL';
    console.log(`${icon} ${result.case} (${result.summary.durationMs ?? 0}ms)`);
    result.warnings?.forEach((warning) => console.log(`  WARN ${warning}`));
    result.failures?.forEach((failure) => console.log(`  FAIL ${failure}`));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.all) {
    const results = runAll(args);
    if (args.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      printHuman(results);
    }
    if (results.some((result) => result.status === 'FAIL')) {
      process.exit(1);
    }
    return;
  }

  if (!args.caseName) {
    console.error('Usage: node docs/assignment_case_runner.cjs --all | --case <case_name>');
    process.exit(1);
  }

  const result = await runCase(args.caseName, args);
  if (args.json) {
    console.log(JSON.stringify(result));
  } else {
    printHuman(result);
  }
  if (result.status === 'FAIL') {
    process.exit(1);
  }
}

main();
