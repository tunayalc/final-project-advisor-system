import { useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import api from '../api';

export default function PasswordHelp({ onBack }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setNotice({ type: '', text: '' });
    try {
      const { data } = await api.post('/auth/password-help', { email });
      setNotice({ type: 'success', text: data.message });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.error || 'Talep gönderilemedi. Tekrar deneyin.' });
    } finally { setSubmitting(false); }
  };

  return (
    <section aria-labelledby="password-help-title" className="stack-layout">
      <h3 id="password-help-title">Şifremi unuttum</h3>
      <p className="muted-copy">Kayıtlı e-posta adresinizi girin. Şifrenizi unuttuğunuz yöneticinin bildirim listesine eklenecek.</p>
      {notice.text && <div role="status" className={`notice notice-${notice.type}`}>{notice.text}</div>}
      <form className="stack-form" aria-label="Şifre yardım talebi" onSubmit={submit}>
        <label className="field-block">
          <span>Kayıtlı e-posta adresi</span>
          <input className="app-input" type="email" maxLength={254} autoComplete="email"
            placeholder="ogrencinumarasi@ogrenci.ankara.edu.tr" value={email}
            onChange={event => setEmail(event.target.value)} required />
        </label>
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          <Send size={16} /> {submitting ? 'Gönderiliyor' : 'Yöneticiye bildir'}
        </button>
      </form>
      <button className="btn btn-outline" type="button" onClick={onBack}><ArrowLeft size={16} /> Girişe dön</button>
    </section>
  );
}
