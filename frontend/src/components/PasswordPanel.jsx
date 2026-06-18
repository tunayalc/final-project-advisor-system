import { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import api from '../api';

export default function PasswordPanel() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [submitting, setSubmitting] = useState(false);

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
    <section id="password-panel" className="panel" tabIndex="-1">
      <div className="section-header">
        <div>
          <p className="eyebrow">Hesap Güvenliği</p>
          <h3>Şifre güncelle</h3>
        </div>
        <span className="icon-chip">
          <ShieldCheck size={18} />
        </span>
      </div>

      <p className="muted-copy">
        Kurumsal hesap erişiminizi güvende tutmak için şifrenizi düzenli olarak yenileyin.
      </p>

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
