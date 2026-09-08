import { useEffect, useMemo, useState } from 'react';
import { Calculator, Check, Download, Play, RefreshCcw, ShieldCheck, Trash2, UserCog, UserPlus, Users, X } from 'lucide-react';
import api from '../api';
import PasswordPanel from '../components/PasswordPanel';

const ROLE_LABELS = {
  admin: 'Yönetici',
  hoca: 'Danışman',
  ogrenci: 'Öğrenci',
};

const APPROVAL_LABELS = {
  pending: 'Onay bekliyor',
  approved: 'Onaylı',
  rejected: 'Reddedildi',
};

const emptyUserForm = {
  full_name: '',
  email: '',
  password: '',
  department_id: '',
  expertise_keywords: '',
};

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [results, setResults] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [pendingApplications, setPendingApplications] = useState([]);
  const [applicationEdits, setApplicationEdits] = useState({});
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });

  const loadData = async () => {
    try {
      const [
        statsResponse,
        logsResponse,
        usersResponse,
        facultyResponse,
        resultsResponse,
        departmentsResponse,
        applicationsResponse,
      ] = await Promise.all([
        api.get('/admin/get_dashboard_data'),
        api.get('/admin/logs'),
        api.get('/admin/users'),
        api.get('/admin/faculty-overview'),
        api.get('/admin/results'),
        api.get('/admin/departments'),
        api.get('/admin/student-applications'),
      ]);

      setStats(statsResponse.data);
      setLogs(logsResponse.data);
      setUsers(usersResponse.data);
      setFacultyList(facultyResponse.data);
      setResults(resultsResponse.data);
      setDepartments(departmentsResponse.data);
      setPendingApplications(applicationsResponse.data);
      setApplicationEdits(Object.fromEntries(applicationsResponse.data.map((application) => [
        application.id,
        {
          full_name: application.full_name || '',
          email: application.email || '',
          gano: String(application.gano ?? ''),
          entry_year: String(application.entry_year ?? ''),
        },
      ])));
    } catch {
      setNotice({ type: 'error', text: 'Yönetici verileri yüklenemedi.' });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!userForm.department_id && departments.length > 0) {
      setUserForm((current) => ({
        ...current,
        department_id: String(departments[0].id),
      }));
    }
  }, [departments, userForm.department_id]);

  const activeFaculty = useMemo(
    () => facultyList.filter((faculty) => faculty.is_active === 1),
    [facultyList],
  );

  const assignedStudents = useMemo(
    () => users.filter((item) => item.role === 'ogrenci' && item.assigned_faculty_name),
    [users],
  );

  const unassignedStudents = useMemo(
    () => users.filter((item) => item.role === 'ogrenci' && item.approval_status === 'approved' && !item.assigned_faculty_name),
    [users],
  );

  const assignableResults = useMemo(
    () => results.filter((result) => result.approval_status === 'approved'),
    [results],
  );

  const selectedStudent = useMemo(
    () => assignableResults.find((result) => String(result.student_id) === String(selectedStudentId)),
    [assignableResults, selectedStudentId],
  );

  const facultyForSelectedStudent = useMemo(
    () => activeFaculty.filter((faculty) => (
      selectedStudent && faculty.department_id === selectedStudent.student_department_id
    )),
    [activeFaculty, selectedStudent],
  );

  useEffect(() => {
    if (
      selectedFacultyId &&
      !facultyForSelectedStudent.some((faculty) => String(faculty.id) === String(selectedFacultyId))
    ) {
      setSelectedFacultyId('');
    }
  }, [facultyForSelectedStudent, selectedFacultyId]);

  const handleAction = async (endpoint, successText) => {
    setLoading(true);
    setNotice({ type: '', text: '' });

    try {
      const response = await api.post(`/admin/${endpoint}`);
      setNotice({ type: 'success', text: `${successText}. ${response.data.message || ''}`.trim() });
      await loadData();
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.error || 'İşlem tamamlanamadı.' });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await api.get('/admin/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'atama-sonuclari.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      setNotice({ type: 'error', text: 'CSV dışa aktarma işlemi başarısız oldu.' });
    }
  };

  const handleFacultyStatus = async (facultyId, nextStatus) => {
    try {
      const response = await api.patch(`/admin/faculty/${facultyId}/status`, { is_active: nextStatus });
      setNotice({ type: 'success', text: response.data.message });
      await loadData();
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.error || 'Danışman durumu güncellenemedi.' });
    }
  };

  const handleDeleteUser = async (userId, fullName) => {
    const confirmed = window.confirm(`${fullName} kaydını sistemden kaldırmak istiyor musunuz?`);
    if (!confirmed) {
      return;
    }

    try {
      const response = await api.delete(`/admin/users/${userId}`);
      setNotice({ type: 'success', text: response.data.message });
      await loadData();
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.error || 'Kullanıcı silinemedi.' });
    }
  };

  const updateUserForm = (field, value) => {
    setUserForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateApplicationEdit = (applicationId, field, value) => {
    setApplicationEdits((current) => ({
      ...current,
      [applicationId]: {
        ...current[applicationId],
        [field]: value,
      },
    }));
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setCreatingUser(true);
    setNotice({ type: '', text: '' });

    try {
      const payload = {
        full_name: userForm.full_name.trim(),
        email: userForm.email.trim(),
        password: userForm.password,
        department_id: Number(userForm.department_id),
        expertise_keywords: userForm.expertise_keywords.trim(),
      };

      const response = await api.post('/admin/users', payload);
      setNotice({ type: 'success', text: response.data.message });
      setUserForm({
        ...emptyUserForm,
        department_id: userForm.department_id,
      });
      await loadData();
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.error || 'Kullanıcı eklenemedi.' });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleReviewApplication = async (applicationId, approvalStatus) => {
    const edit = applicationEdits[applicationId];
    if (!edit) {
      return;
    }

    try {
      const response = await api.patch(`/admin/students/${applicationId}/review`, {
        ...edit,
        gano: Number(edit.gano),
        entry_year: Number(edit.entry_year),
        approval_status: approvalStatus,
      });
      setNotice({ type: 'success', text: response.data.message });
      await loadData();
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.error || 'Öğrenci başvurusu güncellenemedi.' });
    }
  };

  const handleForceAssign = async (event) => {
    event.preventDefault();

    if (!selectedStudentId || !selectedFacultyId) {
      setNotice({ type: 'error', text: 'Manuel atama için öğrenci ve danışman seçin.' });
      return;
    }

    try {
      const response = await api.post('/admin/force-assign', {
        student_id: Number(selectedStudentId),
        faculty_id: Number(selectedFacultyId),
      });
      setNotice({ type: 'success', text: response.data.message });
      await loadData();
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.error || 'Manuel atama tamamlanamadı.' });
    }
  };

  return (
    <div className="stack-layout animate-fade-in">
      <section className="hero-banner">
        <div>
          <p className="eyebrow">Yönetici Modülü</p>
          <h1>Yerleştirme ve kullanıcı yönetimi</h1>
          <p className="muted-copy">
            Bu panel; kontenjan hesaplama, GANO merkezli merkezi yerleştirme, kullanıcı yaşam döngüsü
            ve dönem içi danışman değişikliği işlemleri için kullanılır.
          </p>
        </div>

        <div className="action-row">
          <button type="button" className="btn btn-outline" onClick={handleExport}>
            <Download size={16} />
            Sonuçları indir
          </button>
          <button type="button" className="btn btn-outline" onClick={loadData}>
            <RefreshCcw size={16} />
            Verileri yenile
          </button>
        </div>
      </section>

      {notice.text && <div className={`notice notice-${notice.type}`}>{notice.text}</div>}

      {stats && (
        <section className="stat-grid">
          <article className="stat-card">
            <span>Toplam öğrenci</span>
            <strong>{stats.studentCount}</strong>
          </article>
          <article className="stat-card">
            <span>Atanan öğrenci</span>
            <strong>{stats.assignedStudentCount}</strong>
          </article>
          <article className="stat-card">
            <span>Aktif danışman</span>
            <strong>{activeFaculty.length}</strong>
          </article>
          <article className="stat-card">
            <span>Bekleyen öğrenci</span>
            <strong>{unassignedStudents.length}</strong>
          </article>
          <article className="stat-card">
            <span>Onay bekleyen</span>
            <strong>{pendingApplications.length}</strong>
          </article>
        </section>
      )}



      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Kayıt Yönetimi</p>
            <h2>Danışman ekle</h2>
          </div>
          <span className="icon-chip">
            <UserPlus size={18} />
          </span>
        </div>

        <form className="stack-form" onSubmit={handleCreateUser}>
          <div className="duo-grid align-start">
            <label className="field-block">
              <span>Bölüm</span>
              <select
                className="app-input"
                value={userForm.department_id}
                onChange={(event) => updateUserForm('department_id', event.target.value)}
                required
              >
                <option value="">Bölüm seçin</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-block">
              <span>Uzmanlık alanları</span>
              <input
                type="text"
                className="app-input"
                placeholder="Yapay Zeka, Veri Madenciliği"
                value={userForm.expertise_keywords}
                onChange={(event) => updateUserForm('expertise_keywords', event.target.value)}
              />
            </label>
          </div>

          <div className="duo-grid align-start">
            <label className="field-block">
              <span>Ad soyad</span>
              <input
                type="text"
                className="app-input"
                value={userForm.full_name}
                onChange={(event) => updateUserForm('full_name', event.target.value)}
                required
              />
            </label>

            <label className="field-block">
              <span>E-posta</span>
              <input
                type="email"
                className="app-input"
                value={userForm.email}
                onChange={(event) => updateUserForm('email', event.target.value)}
                required
              />
            </label>
          </div>

          <div className="duo-grid align-start">
            <label className="field-block">
              <span>Geçici şifre</span>
              <input
                type="password"
                className="app-input"
                value={userForm.password}
                minLength={6}
                onChange={(event) => updateUserForm('password', event.target.value)}
                required
              />
            </label>

          </div>

          <div className="action-row">
            <button type="submit" className="btn btn-primary" disabled={creatingUser}>
              <UserPlus size={16} />
              {creatingUser ? 'Ekleniyor' : 'Danışman ekle'}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Öğrenci Başvuruları</p>
            <h2>Onay bekleyen kayıtlar</h2>
          </div>
          <span className="icon-chip">
            <ShieldCheck size={18} />
          </span>
        </div>

        {pendingApplications.length === 0 ? (
          <div className="empty-state">Onay bekleyen öğrenci kaydı yok.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Transkript</th>
                  <th>GANO</th>
                  <th>Giriş yılı</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {pendingApplications.map((application) => {
                  const edit = applicationEdits[application.id] || {};

                  return (
                    <tr key={application.id}>
                      <td>
                        <input
                          type="text"
                          className="app-input table-input"
                          value={edit.full_name || ''}
                          onChange={(event) => updateApplicationEdit(application.id, 'full_name', event.target.value)}
                        />
                        <input
                          type="email"
                          className="app-input table-input"
                          value={edit.email || ''}
                          onChange={(event) => updateApplicationEdit(application.id, 'email', event.target.value)}
                        />
                      </td>
                      <td>
                        <strong>{application.transcript_full_name || 'Ad okunamadı'}</strong>
                        <span>{application.department_name}</span>
                        {application.transcript_warning && <span className="text-warning">{application.transcript_warning}</span>}
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="4"
                          step="0.01"
                          className="app-input table-input"
                          value={edit.gano || ''}
                          onChange={(event) => updateApplicationEdit(application.id, 'gano', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="2000"
                          max="2100"
                          className="app-input table-input"
                          value={edit.entry_year || ''}
                          onChange={(event) => updateApplicationEdit(application.id, 'entry_year', event.target.value)}
                        />
                      </td>
                      <td>
                        <div className="icon-actions">
                          <button
                            type="button"
                            className="btn btn-primary btn-small"
                            onClick={() => handleReviewApplication(application.id, 'approved')}
                          >
                            <Check size={15} />
                            Onayla
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-small"
                            onClick={() => handleReviewApplication(application.id, 'rejected')}
                          >
                            <X size={15} />
                            Reddet
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="duo-grid align-start">
        <section className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Operasyonlar</p>
              <h2>Yerleştirme akışı</h2>
            </div>
            <span className="icon-chip">
              <ShieldCheck size={18} />
            </span>
          </div>

          <p className="muted-copy">
            Kontenjan hesabı aktif danışmanlara dengeli dağıtılır. Merkezi yerleştirme,
            onaylı öğrencileri %80 GANO ve %20 tercih sırası puanına göre işler.
          </p>

          <div className="action-stack">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => handleAction('calculate-quotas', 'Kontenjanlar güncellendi')}
              disabled={loading}
            >
              <Calculator size={16} />
              Kontenjanları hesapla
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleAction('run-assignment', 'Merkezi yerleştirme tamamlandı')}
              disabled={loading}
            >
              <Play size={16} />
              Merkezi yerleştirmeyi çalıştır
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Manuel Danışman Değişikliği</p>
              <h2>Öğrenciyi yeniden ata</h2>
            </div>
            <span className="icon-chip">
              <UserCog size={18} />
            </span>
          </div>

          <form className="stack-form" onSubmit={handleForceAssign}>
            <label className="field-block">
              <span>Öğrenci</span>
              <select
                className="app-input"
                value={selectedStudentId}
                onChange={(event) => {
                  setSelectedStudentId(event.target.value);
                  setSelectedFacultyId('');
                }}
                required
              >
                <option value="">Öğrenci seçin</option>
                {assignableResults.map((result) => (
                  <option key={result.student_id} value={result.student_id}>
                    {result.student_name} · {result.student_department} · {result.gano} · {result.faculty_name || 'Atanmadı'}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-block">
              <span>Danışman</span>
              <select
                className="app-input"
                value={selectedFacultyId}
                onChange={(event) => setSelectedFacultyId(event.target.value)}
                disabled={!selectedStudent}
                required
              >
                <option value="">
                  {selectedStudent ? `${selectedStudent.student_department} danışmanı seçin` : 'Önce öğrenci seçin'}
                </option>
                {facultyForSelectedStudent.map((faculty) => (
                  <option key={faculty.id} value={faculty.id}>
                    {faculty.full_name} · {faculty.department_name} · {faculty.current_quota}/{faculty.base_quota}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" className="btn btn-primary">
              Atamayı güncelle
            </button>
          </form>
        </section>
      </div>

      <div className="duo-grid align-start">
        <section className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Danışman Yönetimi</p>
              <h2>Aktif ve pasif durumlar</h2>
            </div>
            <span className="icon-chip">
              <Users size={18} />
            </span>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Danışman</th>
                  <th>Bölüm</th>
                  <th>Kontenjan</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {facultyList.map((faculty) => (
                  <tr key={faculty.id}>
                    <td>
                      <strong>{faculty.full_name}</strong>
                      <span>{faculty.email}</span>
                    </td>
                    <td>{faculty.department_name}</td>
                    <td>{faculty.current_quota}/{faculty.base_quota}</td>
                    <td>
                      <span className={`pill ${faculty.is_active === 1 ? 'pill-success' : 'pill-warning'}`}>
                        {faculty.is_active === 1 ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline btn-small"
                        onClick={() => handleFacultyStatus(faculty.id, faculty.is_active !== 1)}
                      >
                        {faculty.is_active === 1 ? 'Pasife al' : 'Aktif et'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Kullanıcı Dizini</p>
              <h2>Silme ve denetim</h2>
            </div>
            <span className="icon-chip">
              <Trash2 size={18} />
            </span>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ad Soyad</th>
                  <th>Rol</th>
                  <th>Detay</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.full_name}</strong>
                      <span>{item.email}</span>
                    </td>
                    <td>{ROLE_LABELS[item.role] || item.role}</td>
                    <td>
                      {item.role === 'ogrenci'
                        ? `${item.department_name || '-'} · ${item.gano || '-'} · ${APPROVAL_LABELS[item.approval_status] || '-'}`
                        : item.role === 'hoca'
                          ? `${item.department_name || '-'} · ${item.is_active === 1 ? 'Aktif' : 'Pasif'}`
                          : 'Yönetici hesabı'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-danger btn-small"
                        onClick={() => handleDeleteUser(item.id, item.full_name)}
                      >
                        Kaldır
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="duo-grid align-start">
        <section className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Yerleştirme Özeti</p>
              <h2>Öğrenci dağılımı</h2>
            </div>
            <span className="icon-chip">
              <Users size={18} />
            </span>
          </div>

          <div className="detail-stack">
            <div className="detail-row">
              <span>Atanmış öğrenci</span>
              <strong>{assignedStudents.length}</strong>
            </div>
            <div className="detail-row">
              <span>Atama bekleyen öğrenci</span>
              <strong>{unassignedStudents.length}</strong>
            </div>
            <div className="detail-row">
              <span>Toplam log kaydı</span>
              <strong>{logs.length}</strong>
            </div>
          </div>
        </section>

        <PasswordPanel />
      </div>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">İşlem Günlüğü</p>
            <h2>Son hareketler</h2>
          </div>
          <span className="icon-chip">
            <RefreshCcw size={18} />
          </span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Eylem</th>
                <th>Öğrenci</th>
                <th>Danışman</th>
                <th>Detay</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 20).map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.timestamp).toLocaleString('tr-TR')}</td>
                  <td>{log.action}</td>
                  <td>{log.student_name || '-'}</td>
                  <td>{log.faculty_name || '-'}</td>
                  <td>{log.details || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
