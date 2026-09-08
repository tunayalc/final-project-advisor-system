const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

function assertApprovedStudent(student) {
  if (student.approval_status !== 'approved') {
    return {
      status: 403,
      error: student.approval_status === 'rejected' ?
      'Öğrenci kaydınız reddedildiği için bu işlem yapılamaz.' :
      'Admin onayı bekleniyor. Onaylanmadan tercih işlemi yapamazsınız.'
    };
  }

  return null;
}

// Get student profile
router.get('/me', authenticate, authorize('ogrenci'), async (req, res) => {
  try {
    const db = getDb();
    const student = await db.prepare(`
            SELECT s.*, d.name as department_name, f.full_name as assigned_faculty_name
            FROM students s
            JOIN departments d ON s.department_id = d.id
            LEFT JOIN faculty fac ON s.assigned_faculty_id = fac.id
            LEFT JOIN users f ON fac.user_id = f.id
            WHERE s.user_id = ?
        `).get(req.user.id);

    if (!student) return res.status(404).json({ error: 'Öğrenci profili bulunamadı.' });

    res.json(student);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Sunucu hatası.' });
  }
});

// Get faculty list for preferences
router.get('/faculty-list', authenticate, authorize('ogrenci'), async (req, res) => {
  try {
    const db = getDb();
    const student = await db.prepare('SELECT department_id, approval_status FROM students WHERE user_id = ?').get(req.user.id);

    if (!student) {
      return res.status(404).json({ error: 'Öğrenci bulunamadı.' });
    }

    const approvalError = assertApprovedStudent(student);
    if (approvalError) {
      return res.status(approvalError.status).json({ error: approvalError.error });
    }

    const facultyList = await db.prepare(`
            SELECT f.id, u.full_name, d.name as department_name, f.expertise_keywords, f.base_quota, f.current_quota
            FROM faculty f
            JOIN users u ON f.user_id = u.id
            JOIN departments d ON f.department_id = d.id
            WHERE f.is_active = 1 AND f.department_id = ?
            ORDER BY u.full_name ASC
        `).all(student.department_id);

    res.json(facultyList);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Sunucu hatası.' });
  }
});

// Get saved preferences
router.get('/preferences', authenticate, authorize('ogrenci'), async (req, res) => {
  try {
    const db = getDb();
    const student = await db.prepare('SELECT id, department_id, approval_status FROM students WHERE user_id = ?').get(req.user.id);

    if (!student) {
      return res.status(404).json({ error: 'Öğrenci bulunamadı.' });
    }

    const approvalError = assertApprovedStudent(student);
    if (approvalError) {
      return res.status(approvalError.status).json({ error: approvalError.error });
    }

    const preferences = await db.prepare(`
            SELECT p.rank, f.id, u.full_name, d.name as department_name, f.expertise_keywords
            FROM preferences p
            JOIN faculty f ON p.faculty_id = f.id
            JOIN users u ON f.user_id = u.id
            JOIN departments d ON f.department_id = d.id
            WHERE p.student_id = ? AND f.department_id = ?
            ORDER BY p.rank ASC
        `).all(student.id, student.department_id);

    res.json(preferences);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Sunucu hatası.' });
  }
});

// Save preferences
router.post('/preferences', authenticate, authorize('ogrenci'), async (req, res) => {
  try {
    const { preferences } = req.body; // Array of faculty_ids in order
    if (!Array.isArray(preferences) || preferences.length === 0) {
      return res.status(400).json({ error: 'Geçersiz tercih listesi.' });
    }

    const db = getDb();
    const student = await db.prepare('SELECT id, is_assigned, department_id, approval_status FROM students WHERE user_id = ?').get(req.user.id);

    if (!student) return res.status(404).json({ error: 'Öğrenci bulunamadı.' });
    const approvalError = assertApprovedStudent(student);
    if (approvalError) {
      return res.status(approvalError.status).json({ error: approvalError.error });
    }
    if (student.is_assigned) return res.status(400).json({ error: 'Zaten bir danışmana atanmışsınız. Tercih değiştiremezsiniz.' });

    const activeFacultyIds = new Set(
      (await db.prepare('SELECT id FROM faculty WHERE is_active = 1 AND department_id = ?').
      all(student.department_id)).
      map((faculty) => faculty.id)
    );

    if (!preferences.every((facultyId) => activeFacultyIds.has(facultyId))) {
      return res.status(400).json({ error: 'Tercih listenizde pasif, farklı bölümden veya geçersiz bir danışman bulunuyor.' });
    }

    // Start transaction
    const savePrefs = db.transaction(async (studentId, prefs) => {
      const current = await db.prepare('SELECT is_assigned, approval_status FROM students WHERE id = ?').get(studentId);
      if (!current || current.is_assigned || current.approval_status !== 'approved') {
        const error = new Error('Tercihler bu öğrenci için artık değiştirilemez.');
        error.status = 409;
        throw error;
      }
      // Delete old prefs
      await db.prepare('DELETE FROM preferences WHERE student_id = ?').run(studentId);

      const insertStmt = db.prepare('INSERT INTO preferences (student_id, faculty_id, rank) VALUES (?, ?, ?)');for (const [
      index, faculty_id] of prefs.entries()) {
        await insertStmt.run(studentId, faculty_id, index + 1);
      }

      // Log action
      await db.prepare('INSERT INTO assignment_logs (student_id, action, details) VALUES (?, ?, ?)').
      run(studentId, 'UPDATE_PREFERENCES', `Tercihler güncellendi: ${prefs.join(',')}`);
    });

    await savePrefs(student.id, preferences);
    res.json({ message: 'Tercih listesi başarıyla kaydedildi.' });

  } catch (err) {
    console.error(err);
    // SQLite unique constraint error etc.
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Sunucu hatası.' });
  }
});

// Get invitations
router.get('/invitations', authenticate, authorize('ogrenci'), async (req, res) => {
  try {
    const db = getDb();
    const student = await db.prepare('SELECT id, approval_status FROM students WHERE user_id = ?').get(req.user.id);
    if (!student) return res.status(404).json({ error: 'Öğrenci bulunamadı.' });

    const approvalError = assertApprovedStudent(student);
    if (approvalError) {
      return res.status(approvalError.status).json({ error: approvalError.error });
    }

    const invitations = await db.prepare(`
            SELECT p.id, p.status, p.created_at, f.id as faculty_id, u.full_name as faculty_name, f.expertise_keywords
            FROM pre_assignments p
            JOIN faculty f ON p.faculty_id = f.id
            JOIN users u ON f.user_id = u.id
            WHERE p.student_id = ?
        `).all(student.id);

    res.json(invitations);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Sunucu hatası.' });
  }
});

// Respond to invitation
router.post('/invitations/:id/respond', authenticate, authorize('ogrenci'), async (req, res) => {
  try {
    const { status } = req.body; // 'accepted' or 'rejected'
    const inviteId = req.params.id;

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Geçersiz durum.' });
    }

    const db = getDb();
    const student = await db.prepare('SELECT id, is_assigned, department_id, approval_status FROM students WHERE user_id = ?').get(req.user.id);
    if (!student) return res.status(404).json({ error: 'Öğrenci bulunamadı.' });
    const approvalError = assertApprovedStudent(student);
    if (approvalError) {
      return res.status(approvalError.status).json({ error: approvalError.error });
    }

    if (student.is_assigned) {
      return res.status(400).json({ error: 'Zaten bir danışmana atanmışsınız.' });
    }

    const invite = await db.prepare('SELECT * FROM pre_assignments WHERE id = ? AND student_id = ?').get(inviteId, student.id);
    if (!invite) return res.status(404).json({ error: 'Davet bulunamadı.' });
    if (invite.status !== 'pending') return res.status(400).json({ error: 'Bu davet zaten yanıtlanmış.' });
    const faculty = await db.prepare('SELECT is_active, department_id FROM faculty WHERE id = ?').get(invite.faculty_id);
    if (!faculty || faculty.is_active !== 1) {
      return res.status(400).json({ error: 'Bu danışman şu anda aktif olmadığı için teklif sonuçlandırılamaz.' });
    }
    if (faculty.department_id !== student.department_id) {
      return res.status(400).json({ error: 'Farklı bölümden gelen danışmanlık teklifi kabul edilemez.' });
    }

    const transaction = db.transaction(async () => {
      const currentStudent = await db.prepare('SELECT is_assigned, approval_status FROM students WHERE id = ?').get(student.id);
      const currentInvite = await db.prepare('SELECT status FROM pre_assignments WHERE id = ?').get(inviteId);
      if (!currentStudent || currentStudent.is_assigned || currentStudent.approval_status !== 'approved' || currentInvite?.status !== 'pending') {
        const error = new Error('Öğrencinin veya davetin durumu değişti. Sayfayı yenileyin.');
        error.status = 409;
        throw error;
      }
      await db.prepare('UPDATE pre_assignments SET status = ? WHERE id = ?').run(status, inviteId);

      if (status === 'accepted') {
        // Assign student
        await db.prepare('UPDATE students SET is_assigned = 1, assigned_faculty_id = ? WHERE id = ?').
        run(invite.faculty_id, student.id);

        // Increase faculty quota usage
        await db.prepare('UPDATE faculty SET current_quota = current_quota + 1 WHERE id = ?').
        run(invite.faculty_id);

        // Reject all other pending invites for this student
        await db.prepare("UPDATE pre_assignments SET status = 'rejected' WHERE student_id = ? AND status = 'pending'").
        run(student.id);
      }

      await db.prepare('INSERT INTO assignment_logs (student_id, faculty_id, action, details) VALUES (?, ?, ?, ?)').
      run(student.id, invite.faculty_id, `INVITE_${status.toUpperCase()}`, `Davet ID: ${inviteId}`);
    });

    await transaction();
    res.json({ message: status === 'accepted' ? 'Davet kabul edildi.' : 'Davet reddedildi.' });

  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Sunucu hatası.' });
  }
});

module.exports = router;
