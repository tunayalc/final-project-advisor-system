const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Get faculty profile and quota info
router.get('/me', authenticate, authorize('hoca'), async (req, res) => {
  try {
    const db = getDb();
    const faculty = await db.prepare(`
            SELECT f.*, d.name as department_name, u.full_name
            FROM faculty f
            JOIN departments d ON f.department_id = d.id
            JOIN users u ON f.user_id = u.id
            WHERE f.user_id = ?
        `).get(req.user.id);

    if (!faculty) return res.status(404).json({ error: 'Danışman profili bulunamadı.' });

    res.json(faculty);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Search students
router.get('/students', authenticate, authorize('hoca'), async (req, res) => {
  try {
    const db = getDb();
    const faculty = await db.prepare('SELECT id, is_active, department_id FROM faculty WHERE user_id = ?').get(req.user.id);
    if (!faculty || faculty.is_active !== 1) {
      return res.status(403).json({ error: 'Pasif durumdaki danışmanlar yeni öğrenci arayamaz.' });
    }

    // Return students who are NOT assigned yet
    // Optionally filter by GANO
    const { minGano } = req.query;
    let query = `
            SELECT s.id, u.full_name, s.gano, s.entry_year, d.name as department_name
            FROM students s
            JOIN users u ON s.user_id = u.id
            JOIN departments d ON s.department_id = d.id
            WHERE s.is_assigned = 0 AND s.department_id = ? AND s.approval_status = 'approved'
        `;
    let params = [faculty.department_id];

    if (minGano) {
      query += ' AND s.gano >= ?';
      params.push(parseFloat(minGano));
    }

    query += ' ORDER BY s.gano DESC, s.id ASC';

    const students = await db.prepare(query).all(...params);
    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Invite student
router.post('/invite', authenticate, authorize('hoca'), async (req, res) => {
  try {
    const { student_id } = req.body;
    const db = getDb();

    if (!student_id) return res.status(400).json({ error: 'Öğrenci ID gerekli.' });

    const faculty = await db.prepare('SELECT id, base_quota, current_quota, is_active, department_id FROM faculty WHERE user_id = ?').get(req.user.id);
    if (!faculty || faculty.is_active !== 1) {
      return res.status(403).json({ error: 'Pasif durumdaki danışmanlar teklif gönderemez.' });
    }

    if (faculty.current_quota >= faculty.base_quota && faculty.base_quota > 0) {
      return res.status(400).json({ error: 'Mevcut kontenjanınız dolu olduğu için yeni teklif gönderemezsiniz.' });
    }

    const student = await db.prepare('SELECT is_assigned, department_id, approval_status FROM students WHERE id = ?').get(student_id);
    if (!student) return res.status(404).json({ error: 'Öğrenci bulunamadı.' });
    if (student.approval_status !== 'approved') {
      return res.status(400).json({ error: 'Yalnızca admin onaylı öğrencilere teklif gönderilebilir.' });
    }
    if (student.is_assigned) return res.status(400).json({ error: 'Öğrenci zaten atanmış.' });
    if (student.department_id !== faculty.department_id) {
      return res.status(400).json({ error: 'Danışman yalnızca kendi bölümündeki öğrencilere teklif gönderebilir.' });
    }

    // Check if already invited
    const existing = await db.prepare('SELECT id FROM pre_assignments WHERE student_id = ? AND faculty_id = ?').get(student_id, faculty.id);
    if (existing) return res.status(400).json({ error: 'Bu öğrenciye zaten davet gönderdiniz.' });

    await db.transaction(async () => {
      await db.prepare('INSERT INTO pre_assignments (student_id, faculty_id) VALUES (?, ?)').run(student_id, faculty.id);
      await db.prepare('INSERT INTO assignment_logs (student_id, faculty_id, action, details) VALUES (?, ?, ?, ?)').
      run(student_id, faculty.id, 'INVITE_SENT', 'Danışman ön atama daveti gönderdi.');
    })();

    res.json({ message: 'Davet gönderildi.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Assigned students
router.get('/assigned', authenticate, authorize('hoca'), async (req, res) => {
  try {
    const db = getDb();
    const faculty = await db.prepare('SELECT id FROM faculty WHERE user_id = ?').get(req.user.id);

    const assignedStudents = await db.prepare(`
            SELECT s.id, u.full_name, u.email, s.gano, s.entry_year, d.name as department_name
            FROM students s
            JOIN users u ON s.user_id = u.id
            JOIN departments d ON s.department_id = d.id
            WHERE s.assigned_faculty_id = ?
        `).all(faculty.id);

    res.json(assignedStudents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

module.exports = router;
