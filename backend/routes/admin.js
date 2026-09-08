const { DEPARTMENT } = require('../services/transcript');
const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const engine = require('../engine/assignment');

const router = express.Router();

router.post('/calculate-quotas', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await engine.calculateQuotas();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

router.post('/run-assignment', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await engine.runAssignment();
    res.json(result);
  } catch (err) {
    console.error(err);
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Bu bölüm zaten kayıtlı.' });
    }
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

router.get('/results', authenticate, authorize('admin'), async (req, res) => {
  try {
    const db = getDb();
    const results = await db.prepare(`
            SELECT 
                s.id as student_id,
                us.full_name as student_name,
                s.gano,
                s.approval_status,
                s.department_id as student_department_id,
                ds.name as student_department,
                f.id as faculty_id,
                uf.full_name as faculty_name
            FROM students s
            JOIN users us ON s.user_id = us.id
            LEFT JOIN departments ds ON s.department_id = ds.id
            LEFT JOIN faculty f ON s.assigned_faculty_id = f.id
            LEFT JOIN users uf ON f.user_id = uf.id
            ORDER BY s.approval_status ASC, s.gano DESC
        `).all();

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

router.post('/force-assign', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { student_id, faculty_id } = req.body;
    if (!student_id || !faculty_id) return res.status(400).json({ error: 'student_id ve faculty_id gerekli.' });

    const db = getDb();
    const targetFaculty = await db.prepare('SELECT id, is_active, department_id FROM faculty WHERE id = ?').get(faculty_id);

    if (!targetFaculty) {
      return res.status(404).json({ error: 'Danışman bulunamadı.' });
    }

    if (targetFaculty.is_active !== 1) {
      return res.status(400).json({ error: 'Pasif durumdaki danışmana manuel atama yapılamaz.' });
    }

    await db.transaction(async () => {
      // Check current assignment
      const student = await db.prepare('SELECT assigned_faculty_id, department_id, approval_status FROM students WHERE id = ?').get(student_id);
      if (!student) {
        throw new Error('Öğrenci bulunamadı.');
      }

      if (student.approval_status !== 'approved') {
        throw new Error('Yalnızca onaylı öğrenciler atanabilir.');
      }

      if (student.department_id !== targetFaculty.department_id) {
        throw new Error('Öğrenci yalnızca kendi bölümündeki danışmana atanabilir.');
      }

      if (student && student.assigned_faculty_id) {
        // decrement old faculty quota
        await db.prepare('UPDATE faculty SET current_quota = current_quota - 1 WHERE id = ?').run(student.assigned_faculty_id);
      }

      // Assign new
      await db.prepare('UPDATE students SET is_assigned = 1, assigned_faculty_id = ? WHERE id = ?').run(faculty_id, student_id);
      await db.prepare('UPDATE faculty SET current_quota = current_quota + 1 WHERE id = ?').run(faculty_id);

      await db.prepare('INSERT INTO assignment_logs (student_id, faculty_id, action, details) VALUES (?, ?, ?, ?)').
      run(student_id, faculty_id, 'FORCE_ASSIGN', 'Admin tarafından manuel atama yapıldı.');
    })();

    res.json({ message: 'Zorunlu atama başarılı.' });
  } catch (err) {
    console.error(err);
    if (
    err.message === 'Öğrenci bulunamadı.' ||
    err.message === 'Yalnızca onaylı öğrenciler atanabilir.' ||
    err.message === 'Öğrenci yalnızca kendi bölümündeki danışmana atanabilir.')
    {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

router.get('/export', authenticate, authorize('admin'), async (req, res) => {
  try {
    const db = getDb();
    const results = await db.prepare(`
            SELECT 
                us.full_name as student_name,
                us.email as student_email,
                s.gano,
                uf.full_name as assigned_faculty_name
            FROM students s
            JOIN users us ON s.user_id = us.id
            LEFT JOIN faculty f ON s.assigned_faculty_id = f.id
            LEFT JOIN users uf ON f.user_id = uf.id
        `).all();

    // Simple CSV generation
    const header = 'Öğrenci Adı,Öğrenci E-posta,GANO,Atanan Danışman\n';
    const rows = results.map((r) => `"${r.student_name}","${r.student_email}",${r.gano},"${r.assigned_faculty_name || 'ATANMADI'}"`).join('\n');

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('atama_sonuclari.csv');
    res.send(`\uFEFF${header}${rows}`);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

router.get('/logs', authenticate, authorize('admin'), async (req, res) => {
  try {
    const db = getDb();
    const logs = await db.prepare(`
            SELECT l.*, 
                   us.full_name as student_name, 
                   uf.full_name as faculty_name
            FROM assignment_logs l
            LEFT JOIN students s ON l.student_id = s.id
            LEFT JOIN users us ON s.user_id = us.id
            LEFT JOIN faculty f ON l.faculty_id = f.id
            LEFT JOIN users uf ON f.user_id = uf.id
            ORDER BY l.timestamp DESC
        `).all();
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

router.get('/get_dashboard_data', authenticate, authorize('admin'), async (req, res) => {
  try {
    const db = getDb();
    const studentCount = (await db.prepare('SELECT COUNT(*) as c FROM students').get()).c;
    const assignedStudentCount = (await db.prepare('SELECT COUNT(*) as c FROM students WHERE is_assigned = 1').get()).c;
    const facultyCount = (await db.prepare('SELECT COUNT(*) as c FROM faculty').get()).c;
    res.json({ studentCount, assignedStudentCount, facultyCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

router.get('/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const db = getDb();
    const users = await db.prepare(`
            SELECT
                u.id,
                u.full_name,
                u.email,
                u.role,
                d.name as department_name,
                f.is_active,
                s.gano,
                s.entry_year,
                s.approval_status,
                s.transcript_full_name,
                s.transcript_warning,
                assigned_u.full_name as assigned_faculty_name
            FROM users u
            LEFT JOIN students s ON s.user_id = u.id
            LEFT JOIN faculty f ON f.user_id = u.id
            LEFT JOIN departments d ON d.id = COALESCE(s.department_id, f.department_id)
            LEFT JOIN faculty assigned_f ON assigned_f.id = s.assigned_faculty_id
            LEFT JOIN users assigned_u ON assigned_u.id = assigned_f.user_id
            ORDER BY
                CASE u.role
                    WHEN 'admin' THEN 0
                    WHEN 'hoca' THEN 1
                    ELSE 2
                END,
                u.full_name ASC
        `).all();

    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

router.get('/departments', authenticate, authorize('admin'), async (req, res) => {
  try {
    const db = getDb();
    const departments = await db.prepare('SELECT id, name FROM departments WHERE name = ?').all(DEPARTMENT);
    res.json(departments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

router.post('/departments', authenticate, authorize('admin'), (req, res) => {
  res.status(403).json({ error: 'Şu anda yalnızca Yapay Zeka ve Veri Mühendisliği bölümü kullanılabilir.' });
});

router.post('/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const {
      email,
      password,
      full_name,
      department_id,
      expertise_keywords
    } = req.body;

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedName = String(full_name || '').trim();
    const departmentId = Number(department_id);
    const db = getDb();

    if (!normalizedEmail || !password || !normalizedName || !departmentId) {
      return res.status(400).json({ error: 'Ad soyad, e-posta, şifre ve bölüm zorunludur.' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır.' });
    }

    const department = await db.prepare('SELECT id FROM departments WHERE id = ? AND name = ?').get(departmentId, DEPARTMENT);
    if (!department) {
      return res.status(404).json({ error: 'Bölüm bulunamadı.' });
    }

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı.' });
    }

    const passwordHash = bcrypt.hashSync(String(password), 10);
    let createdUserId;

    await db.transaction(async () => {
      const result = await db.prepare(
        'INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)'
      ).run(normalizedEmail, passwordHash, 'hoca', normalizedName);
      createdUserId = result.lastInsertRowid;

      await db.prepare(
        'INSERT INTO faculty (user_id, department_id, expertise_keywords) VALUES (?, ?, ?)'
      ).run(createdUserId, departmentId, String(expertise_keywords || '').trim());

      await db.prepare('INSERT INTO assignment_logs (action, details) VALUES (?, ?)').
      run('ADMIN_CREATE_FACULTY', `${normalizedName} danışman olarak yönetici tarafından oluşturuldu.`);
    })();

    res.status(201).json({
      message: `${normalizedName} danışman olarak sisteme eklendi.`,
      user: {
        id: createdUserId,
        email: normalizedEmail,
        role: 'hoca',
        full_name: normalizedName
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

router.get('/student-applications', authenticate, authorize('admin'), async (req, res) => {
  try {
    const db = getDb();
    const applications = await db.prepare(`
            SELECT
                s.id,
                s.user_id,
                u.full_name,
                u.email,
                s.gano,
                s.entry_year,
                s.approval_status,
                s.transcript_full_name,
                s.transcript_warning,
                d.name as department_name
            FROM students s
            JOIN users u ON u.id = s.user_id
            JOIN departments d ON d.id = s.department_id
            WHERE s.approval_status = 'pending'
            ORDER BY u.full_name ASC
        `).all();

    res.json(applications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

router.patch('/students/:studentId/review', authenticate, authorize('admin'), async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    const {
      approval_status,
      full_name,
      email,
      gano,
      entry_year
    } = req.body;
    const normalizedStatus = String(approval_status || '').trim();
    const normalizedName = String(full_name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const parsedGano = Number(gano);
    const parsedEntryYear = Number(entry_year);

    if (!['pending', 'approved', 'rejected'].includes(normalizedStatus)) {
      return res.status(400).json({ error: 'Geçerli bir onay durumu seçin.' });
    }

    if (!normalizedName || !normalizedEmail) {
      return res.status(400).json({ error: 'Ad soyad ve e-posta zorunludur.' });
    }

    if (!Number.isFinite(parsedGano) || parsedGano < 0 || parsedGano > 4) {
      return res.status(400).json({ error: 'GANO 0 ile 4 arasında olmalıdır.' });
    }

    if (!Number.isInteger(parsedEntryYear) || parsedEntryYear < 2000 || parsedEntryYear > 2100) {
      return res.status(400).json({ error: 'Geçerli bir giriş yılı girin.' });
    }

    const db = getDb();
    const student = await db.prepare('SELECT id, user_id, assigned_faculty_id FROM students WHERE id = ?').get(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Öğrenci bulunamadı.' });
    }

    const existingEmail = await db.prepare('SELECT id FROM users WHERE email = ? AND id <> ?').
    get(normalizedEmail, student.user_id);
    if (existingEmail) {
      return res.status(409).json({ error: 'Bu e-posta başka bir kullanıcıda kayıtlı.' });
    }

    await db.transaction(async () => {
      if (normalizedStatus !== 'approved' && student.assigned_faculty_id) {
        await db.prepare('UPDATE faculty SET current_quota = CASE WHEN current_quota > 0 THEN current_quota - 1 ELSE 0 END WHERE id = ?').
        run(student.assigned_faculty_id);
      }

      await db.prepare('UPDATE users SET full_name = ?, email = ? WHERE id = ?').
      run(normalizedName, normalizedEmail, student.user_id);
      await db.prepare(`
                UPDATE students
                SET gano = ?,
                    entry_year = ?,
                    approval_status = ?,
                    is_assigned = CASE WHEN ? = 'approved' THEN is_assigned ELSE 0 END,
                    assigned_faculty_id = CASE WHEN ? = 'approved' THEN assigned_faculty_id ELSE NULL END
                WHERE id = ?
            `).run(parsedGano, parsedEntryYear, normalizedStatus, normalizedStatus, normalizedStatus, studentId);

      if (normalizedStatus !== 'approved') {
        await db.prepare('DELETE FROM preferences WHERE student_id = ?').run(studentId);
        await db.prepare("UPDATE pre_assignments SET status = 'rejected' WHERE student_id = ? AND status = 'pending'").run(studentId);
      }

      await db.prepare('INSERT INTO assignment_logs (student_id, action, details) VALUES (?, ?, ?)').
      run(studentId, 'ADMIN_REVIEW_STUDENT', `${normalizedName} kaydı ${normalizedStatus} durumuna alındı.`);
    })();

    res.json({ message: 'Öğrenci kaydı güncellendi.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

router.get('/faculty-overview', authenticate, authorize('admin'), async (req, res) => {
  try {
    const db = getDb();
    const faculty = await db.prepare(`
            SELECT
                f.id,
                f.department_id,
                u.full_name,
                u.email,
                d.name as department_name,
                f.expertise_keywords,
                f.base_quota,
                f.current_quota,
                f.is_active
            FROM faculty f
            JOIN users u ON u.id = f.user_id
            JOIN departments d ON d.id = f.department_id
            ORDER BY u.full_name ASC
        `).all();

    res.json(faculty);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

router.patch('/faculty/:id/status', authenticate, authorize('admin'), async (req, res) => {
  try {
    const db = getDb();
    const facultyId = parseInt(req.params.id, 10);
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active alanı boolean olmalıdır.' });
    }

    const faculty = await db.prepare('SELECT id FROM faculty WHERE id = ?').get(facultyId);
    if (!faculty) {
      return res.status(404).json({ error: 'Danışman bulunamadı.' });
    }

    await db.prepare('UPDATE faculty SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, facultyId);
    await db.prepare('INSERT INTO assignment_logs (faculty_id, action, details) VALUES (?, ?, ?)').
    run(facultyId, is_active ? 'FACULTY_ACTIVATED' : 'FACULTY_DEACTIVATED', 'Danışman durumu yönetici tarafından güncellendi.');

    res.json({ message: `Danışman durumu ${is_active ? 'aktif' : 'pasif'} olarak güncellendi.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

router.delete('/users/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const db = getDb();
    const userId = parseInt(req.params.id, 10);
    const user = await db.prepare('SELECT id, role, full_name FROM users WHERE id = ?').get(userId);

    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    if (user.role === 'admin') {
      const adminCount = (await db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get()).c;
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Sistemde en az bir yönetici kalmalıdır.' });
      }
    }

    await db.transaction(async () => {
      if (user.role === 'ogrenci') {
        const student = await db.prepare('SELECT id, assigned_faculty_id FROM students WHERE user_id = ?').get(user.id);
        if (student?.assigned_faculty_id) {
          await db.prepare('UPDATE faculty SET current_quota = CASE WHEN current_quota > 0 THEN current_quota - 1 ELSE 0 END WHERE id = ?').
          run(student.assigned_faculty_id);
        }

        if (student) {
          await db.prepare('DELETE FROM preferences WHERE student_id = ?').run(student.id);
          await db.prepare('DELETE FROM pre_assignments WHERE student_id = ?').run(student.id);
          await db.prepare('DELETE FROM assignment_logs WHERE student_id = ?').run(student.id);
          await db.prepare('DELETE FROM students WHERE id = ?').run(student.id);
        }
      }

      if (user.role === 'hoca') {
        const faculty = await db.prepare('SELECT id FROM faculty WHERE user_id = ?').get(user.id);
        if (faculty) {
          const assignedCount = (await db.prepare('SELECT COUNT(*) as c FROM students WHERE assigned_faculty_id = ?').get(faculty.id)).c;
          const pendingInvites = (await db.prepare("SELECT COUNT(*) as c FROM pre_assignments WHERE faculty_id = ? AND status = 'pending'").get(faculty.id)).c;

          if (assignedCount > 0 || pendingInvites > 0) {
            throw new Error('Bu danışman silinmeden önce aktif öğrencileri ve bekleyen teklifleri temizlenmelidir.');
          }

          await db.prepare('DELETE FROM pre_assignments WHERE faculty_id = ?').run(faculty.id);
          await db.prepare('DELETE FROM assignment_logs WHERE faculty_id = ?').run(faculty.id);
          await db.prepare('DELETE FROM faculty WHERE id = ?').run(faculty.id);
        }
      }

      await db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    })();

    res.json({ message: `${user.full_name} sistemden kaldırıldı.` });
  } catch (err) {
    console.error(err);
    const message = err.message === 'Bu danışman silinmeden önce aktif öğrencileri ve bekleyen teklifleri temizlenmelidir.' ?
    err.message :
    'Sunucu hatası.';
    res.status(message === 'Sunucu hatası.' ? 500 : 400).json({ error: message });
  }
});

module.exports = router;
