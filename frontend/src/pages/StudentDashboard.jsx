import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, GraduationCap, Mail, MoveRight, Save, Trash2 } from 'lucide-react';
import api from '../api';
import PasswordPanel from '../components/PasswordPanel';

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export default function StudentDashboard({ user }) {
  const [profile, setProfile] = useState(null);
  const [facultyList, setFacultyList] = useState([]);
  const [preferences, setPreferences] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const sessionUser = user || readStoredUser();

  const loadData = async () => {
    try {
      const profileResponse = await api.get('/students/me');
      setProfile(profileResponse.data);

      if (profileResponse.data.approval_status !== 'approved') {
        setInvitations([]);
        setFacultyList([]);
        setPreferences([]);
        return;
      }

      const [invitationResponse, facultyResponse, preferenceResponse] = await Promise.all([
        api.get('/students/invitations'),
        api.get('/students/faculty-list'),
        api.get('/students/preferences'),
      ]);

      setInvitations(invitationResponse.data);
      setFacultyList(facultyResponse.data);
      setPreferences(preferenceResponse.data);
    } catch {
      setNotice({ type: 'error', text: 'Öğrenci verileri yüklenirken bir sorun oluştu.' });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInvitation = async (invitationId, status) => {
    const confirmed = window.confirm(
      status === 'accepted'
        ? 'Bu danışmanlık teklifini kabul etmek istiyor musunuz?'
        : 'Bu danışmanlık teklifini reddetmek istiyor musunuz?',
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.post(`/students/invitations/${invitationId}/respond`, { status });
      setNotice({
        type: 'success',
        text: status === 'accepted'
          ? 'Danışmanlık teklifi kabul edildi.'
          : 'Danışmanlık teklifi reddedildi.',
      });
      await loadData();
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.error || 'İşlem tamamlanamadı.' });
    }
  };

  const addToPreferences = (faculty) => {
    if (preferences.some((item) => item.id === faculty.id)) {
      return;
    }

    setPreferences([...preferences, faculty]);
  };

  const movePreference = (index, direction) => {
    const next = [...preferences];

    if (direction === 'up' && index > 0) {
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
    }

    if (direction === 'down' && index < next.length - 1) {
      [next[index + 1], next[index]] = [next[index], next[index + 1]];
    }

    setPreferences(next);
  };

  const removePreference = (facultyId) => {
    setPreferences(preferences.filter((item) => item.id !== facultyId));
  };

  const savePreferences = async () => {
    setLoading(true);

    try {
      await api.post('/students/preferences', {
        preferences: preferences.map((item) => item.id),
      });
      setNotice({ type: 'success', text: 'Tercih listeniz kaydedildi.' });
      await loadData();
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.error || 'Tercih listesi kaydedilemedi.' });
    } finally {
      setLoading(false);
    }
  };

  const availableFaculty = facultyList.filter(
    (faculty) => !preferences.some((item) => item.id === faculty.id),
  );
  const pendingInvitations = invitations.filter((invitation) => invitation.status === 'pending');
  const isAssigned = profile?.is_assigned === 1;
  const isApproved = profile?.approval_status === 'approved';

  if (!profile) {
    return (
      <section className="panel panel-centered">
        <p className="eyebrow">Öğrenci Paneli</p>
        <h2>Bilgiler yükleniyor</h2>
      </section>
    );
  }

  return (
    <div className="stack-layout animate-fade-in">
      <section className="hero-banner">
        <div>
          <p className="eyebrow">Öğrenci Modülü</p>
          <h1>{sessionUser?.full_name}</h1>
          <p className="muted-copy">
            {profile.department_name} bölümünde kayıtlı öğrenci profili. Merkezi yerleştirme akışı
            %80 GANO ve %20 tercih sırası puanıyla çalışır.
          </p>
        </div>

        <div className="meta-grid">
          <article className="stat-card">
            <span>GANO</span>
            <strong>{profile.gano?.toFixed?.(2) || profile.gano}</strong>
          </article>
          <article className="stat-card">
            <span>Giriş yılı</span>
            <strong>{profile.entry_year}</strong>
          </article>
          <article className="stat-card">
            <span>Durum</span>
            <strong>
              {profile.approval_status === 'pending'
                ? 'Onay bekliyor'
                : profile.approval_status === 'rejected'
                  ? 'Reddedildi'
                  : isAssigned ? 'Atandı' : 'Tercih bekliyor'}
            </strong>
          </article>
        </div>
      </section>

      {notice.text && <div className={`notice notice-${notice.type}`}>{notice.text}</div>}

      {!isApproved ? (
        <div className="duo-grid">
          <section className="panel emphasis-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Kayıt Durumu</p>
                <h2>
                  {profile.approval_status === 'rejected'
                    ? 'Öğrenci kaydınız reddedildi'
                    : 'Admin onayı bekleniyor'}
                </h2>
              </div>
            </div>

            <p className="muted-copy">
              {profile.approval_status === 'rejected'
                ? 'Bu hesapla tercih oluşturamazsınız. Bilgilerinizin yeniden değerlendirilmesi için yöneticiyle iletişime geçin.'
                : 'Transkriptinizden GANO bilginiz okundu. Admin kaydınızı onayladığında danışman havuzu ve tercih listesi açılacak.'}
            </p>

            <div className="detail-stack">
              <div className="detail-row">
                <span>Okunan GANO</span>
                <strong>{profile.gano?.toFixed?.(2) || profile.gano}</strong>
              </div>
              <div className="detail-row">
                <span>Transkript adı</span>
                <strong>{profile.transcript_full_name || '-'}</strong>
              </div>
              {profile.transcript_warning && (
                <div className="notice notice-info">{profile.transcript_warning}</div>
              )}
            </div>
          </section>

          <PasswordPanel />
        </div>
      ) : isAssigned ? (
        <div className="duo-grid">
          <section className="panel emphasis-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Kesinleşen Sonuç</p>
                <h2>Danışman ataması tamamlandı</h2>
              </div>
            </div>

            <div className="result-card">
              <p>Atanan danışman</p>
              <strong>{profile.assigned_faculty_name}</strong>
              <span>{profile.department_name}</span>
            </div>
          </section>

          <PasswordPanel />
        </div>
      ) : (
        <>
          {pendingInvitations.length > 0 && (
            <section className="stack-layout">
              {pendingInvitations.map((invitation) => (
                <article key={invitation.id} className="panel invite-panel">
                  <div className="invite-copy">
                    <span className="icon-chip">
                      <Mail size={18} />
                    </span>
                    <div>
                      <p className="eyebrow">Manuel Danışman Teklifi</p>
                      <h3>{invitation.faculty_name}</h3>
                      <p className="muted-copy">
                        Bu teklif kabul edildiğinde yerleştirme süreciniz tamamlanır.
                      </p>
                    </div>
                  </div>

                  <div className="action-row">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleInvitation(invitation.id, 'accepted')}
                    >
                      <Check size={16} />
                      Kabul et
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => handleInvitation(invitation.id, 'rejected')}
                    >
                      Teklifi reddet
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}

          <div className="duo-grid align-start">
            <section className="panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Danışman Havuzu</p>
                  <h2>Aktif danışmanlar</h2>
                </div>
                <span className="icon-chip">
                  <GraduationCap size={18} />
                </span>
              </div>

              <p className="muted-copy">
                Tercih havuzundaki tüm danışmanlar aktif durumdadır. Yerleştirme sırasında tercih
                listesi, sistemin hangi danışmanları hangi sırayla deneyeceğini belirler.
              </p>

              <div className="card-list">
                {availableFaculty.length === 0 ? (
                  <div className="empty-state">Eklenebilecek yeni danışman kalmadı.</div>
                ) : (
                  availableFaculty.map((faculty) => (
                    <article key={faculty.id} className="list-card">
                      <div>
                        <h3>{faculty.full_name}</h3>
                        <p>{faculty.department_name}</p>
                        <span>{faculty.expertise_keywords}</span>
                      </div>

                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => addToPreferences(faculty)}
                      >
                        <MoveRight size={16} />
                        Ekle
                      </button>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Tercih Sırası</p>
                  <h2>Kayıtlı tercih listeniz</h2>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={savePreferences}
                  disabled={loading || preferences.length === 0}
                >
                  <Save size={16} />
                  {loading ? 'Kaydediliyor' : 'Tercihleri kaydet'}
                </button>
              </div>

              <div className="card-list">
                {preferences.length === 0 ? (
                  <div className="empty-state">Henüz tercih listeniz oluşturulmadı.</div>
                ) : (
                  preferences.map((preference, index) => (
                    <article key={preference.id} className="preference-card">
                      <div className="preference-index">{index + 1}</div>
                      <div className="preference-copy">
                        <h3>{preference.full_name}</h3>
                        <p>{preference.department_name}</p>
                        <span>{preference.expertise_keywords}</span>
                      </div>
                      <div className="icon-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => movePreference(index, 'up')}
                          disabled={index === 0}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => movePreference(index, 'down')}
                          disabled={index === preferences.length - 1}
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-danger"
                          onClick={() => removePreference(preference.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>

          <PasswordPanel />
        </>
      )}
    </div>
  );
}
