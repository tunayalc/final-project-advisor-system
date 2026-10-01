import { useState } from 'react';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import api from '../api';

export default function AccountSettings({ user, onUserUpdated }) {
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailNotice, setEmailNotice] = useState({ type: '', text: '' });
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    setEmailNotice({ type: '', text: '' });
    setUpdatingEmail(true);
    try {
      const response = await api.post('/auth/change-email', { new_email: newEmail, current_password: emailPassword });
      localStorage.setItem('token', response.data.token);
      onUserUpdated(response.data.user);
      setNewEmail('');
      setEmailPassword('');
      setEmailNotice({ type: 'success', text: response.data.message });
    } catch (error) {
      setEmailNotice({ type: 'error', text: error.response?.data?.error || 'E-posta adresi güncellenemedi.' });
    } finally { setUpdatingEmail(false); }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setNotice({ type: '', text: '' });

    if (newPassword !== confirmPassword) {
      setNotice({ type: 'error', text: 'Yeni şifre ve tekrar şifresi aynı olmalı.' });
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });

      setNotice({ type: 'success', text: response.data.message });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.error || 'Şifre güncellenemedi.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="account-panel" className="panel" tabIndex="-1" aria-labelledby="account-settings-title">
      <div className="section-header">
        <div>
          <p className="eyebrow">Hesabınız</p>
          <h2 id="account-settings-title">Hesap ayarları</h2>
        </div>
        <span className="icon-chip">
          <ShieldCheck size={18} />
        </span>
      </div>

      <h3>E-posta güncelle</h3>
      <p className="muted-copy account-email">Mevcut e-posta: <strong>{user?.email}</strong></p>
      <p className="muted-copy">Adresinizi değiştirdikten sonra yeni e-posta adresinizle giriş yapın. Diğer açık oturumlarınızda yeniden giriş yapmanız gerekir.</p>
      {emailNotice.text && <div role="status" className={`notice notice-${emailNotice.type}`}>{emailNotice.text}</div>}
      <form className="stack-form" onSubmit={handleEmailSubmit} aria-label="E-posta güncelle">
        <label className="field-block">
          <span>Yeni e-posta adresi</span>
          <input type="email" className="app-input" autoComplete="email" maxLength={254}
            placeholder={user?.role === 'ogrenci' ? 'ogrencinumarasi@ogrenci.ankara.edu.tr' : 'adiniz@ankara.edu.tr'}
            value={newEmail} onChange={event => setNewEmail(event.target.value)} required />
        </label>
        <label className="field-block">
          <span>E-posta değişikliği için mevcut şifre</span>
          <input type="password" className="app-input" autoComplete="current-password"
            value={emailPassword} onChange={event => setEmailPassword(event.target.value)} required />
        </label>
        <button type="submit" className="btn btn-primary" disabled={updatingEmail}>
          <Mail size={16} /> {updatingEmail ? 'Kaydediliyor' : 'E-postayı güncelle'}
        </button>
      </form>

      <h3 className="account-password-title">Şifre güncelle</h3>

      {notice.text && (
        <div className={`notice notice-${notice.type}`}>
          {notice.text}
        </div>
      )}

      <form className="stack-form" onSubmit={handleSubmit}>
        <label className="field-block">
          <span>Mevcut şifre</span>
          <input
            type="password"
            autoComplete="current-password"
            className="app-input"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>

        <label className="field-block">
          <span>Yeni şifre</span>
          <input
            type="password"
            autoComplete="new-password"
            className="app-input"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            required
          />
        </label>

        <label className="field-block">
          <span>Yeni şifre tekrar</span>
          <input
            type="password"
            autoComplete="new-password"
            className="app-input"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={8}
            required
          />
        </label>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          <KeyRound size={16} />
          {submitting ? 'Kaydediliyor' : 'Şifreyi güncelle'}
        </button>
      </form>
    </section>
  );
}
