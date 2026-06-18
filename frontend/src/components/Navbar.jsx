import { useNavigate } from 'react-router-dom';
import { GraduationCap, KeyRound, LogOut, Shield, UsersRound } from 'lucide-react';

const ROLE_LABELS = {
  admin: 'Yönetici',
  hoca: 'Danışman',
  ogrenci: 'Öğrenci',
};

const ROLE_ICONS = {
  admin: Shield,
  hoca: UsersRound,
  ogrenci: GraduationCap,
};

export default function Navbar({ user, onLogout, onOpenPasswordDialog }) {
  const navigate = useNavigate();
  const RoleIcon = ROLE_ICONS[user?.role] || Shield;

  const handlePasswordClick = () => {
    if (onOpenPasswordDialog) {
      onOpenPasswordDialog();
      return;
    }

    const passwordPanel = document.getElementById('password-panel');
    passwordPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const firstInput = passwordPanel?.querySelector('input');
    if (firstInput instanceof HTMLElement) {
      firstInput.focus({ preventScroll: true });
    }
  };

  return (
    <nav className="topbar">
      <button className="brand-lockup" type="button" onClick={() => navigate('/')}>
        <div className="brand-mark">AU</div>
        <div className="brand-copy">
          <span className="eyebrow">Ankara Üniversitesi</span>
          <strong>Danışman Atama Sistemi</strong>
        </div>
      </button>

      <div className="topbar-actions">
        <div className="user-badge">
          <RoleIcon size={16} />
          <div>
            <strong>{user?.full_name}</strong>
            <span>{ROLE_LABELS[user?.role] || user?.role}</span>
          </div>
        </div>

        <button onClick={handlePasswordClick} className="btn btn-outline" type="button">
          <KeyRound size={16} />
          Şifre
        </button>

        <button onClick={onLogout} className="btn btn-primary" type="button">
          <LogOut size={16} />
          Çıkış
        </button>
      </div>
    </nav>
  );
}
