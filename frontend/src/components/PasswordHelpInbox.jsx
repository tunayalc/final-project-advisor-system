import { useEffect, useState } from 'react';
import { Check, KeyRound, RefreshCcw } from 'lucide-react';
import api from '../api';

const ROLE_LABELS = { admin: 'Yönetici', hoca: 'Danışman', ogrenci: 'Öğrenci' };

function requestedAt(value) {
  const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(' ', 'T') + 'Z' : value;
  return new Date(timestamp).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
}

export default function PasswordHelpInbox() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    let fetching = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const { data } = await api.get('/admin/password-help-requests', { signal: controller.signal });
        if (active) { setRequests(data); setError(''); }
      } catch {
        if (active) setError('Şifre yardım bildirimleri yüklenemedi. Talepleri yenileyerek tekrar deneyin.');
      } finally {
        fetching = false;
        if (active) setLoading(false);
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 30000);
    return () => { active = false; controller.abort(); window.clearInterval(interval); };
  }, [reload]);

  const review = async (id) => {
    setReviewing(id);
    setNotice('');
    try {
      const { data } = await api.patch(`/admin/password-help-requests/${id}`, { status: 'reviewed' });
      setNotice(data.message);
      setReload(current => current + 1);
    } catch {
      setError('Talep görüldü olarak işaretlenemedi. Tekrar deneyin.');
    } finally { setReviewing(null); }
  };

  return (
    <section className="panel password-help-inbox" aria-labelledby="password-help-inbox-title">
      <div className="section-header">
        <div>
          <p className="eyebrow">Hesap Bildirimleri</p>
          <h2 id="password-help-inbox-title">Şifremi unuttum bildirimleri</h2>
          <p className="muted-copy">Bekleyen talep: {requests.length}</p>
        </div>
        <span className="icon-chip"><KeyRound size={18} /></span>
      </div>
      <p className="muted-copy">Kayıtlı kullanıcıların şifre yardım talepleri burada görünür. Talepler 30 saniyede bir yenilenir.</p>
      <button type="button" className="btn btn-outline" onClick={() => setReload(current => current + 1)}>
        <RefreshCcw size={16} /> Talepleri yenile
      </button>
      {error && <div role="status" className="notice notice-error">{error}</div>}
      {notice && <div role="status" className="notice notice-success">{notice}</div>}
      {loading ? <p className="empty-state">Bildirimler yükleniyor.</p> : !error && requests.length === 0 ? (
        <p className="empty-state">Bekleyen şifre yardım talebi yok.</p>
      ) : requests.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Kullanıcı</th><th>Rol</th><th>Talep zamanı</th><th>İşlem</th></tr></thead>
            <tbody>
              {requests.map(request => (
                <tr key={request.id}>
                  <td><strong>{request.full_name}</strong><span>{request.email}</span></td>
                  <td>{ROLE_LABELS[request.role]}</td>
                  <td>{requestedAt(request.created_at)}</td>
                  <td><button type="button" className="btn btn-outline btn-small" disabled={reviewing !== null} onClick={() => review(request.id)}>
                    <Check size={15} /> {reviewing === request.id ? 'Kaydediliyor' : 'Görüldü işaretle'}
                  </button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
