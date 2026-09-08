import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileText, Lock, UserPlus, UserRound } from 'lucide-react';
import api from '../api';
import AssignmentGuide from '../components/AssignmentGuide';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registerForm, setRegisterForm] = useState({
    full_name: '',
    email: '',
    password: '',
    department_id: '',
    entry_year: String(new Date().getFullYear()),
    transcript: null,
  });
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    api.get('/auth/departments')
      .then((response) => {
        if (!isMounted) {
          return;
        }

        setDepartments(response.data);
        if (response.data.length > 0) {
          setRegisterForm((current) => ({
            ...current,
            department_id: current.department_id || String(response.data[0].id),
          }));
        }
      })
      .catch(() => {
        if (isMounted) {
          setRegisterError('Bölüm listesi yüklenemedi.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));

      if (onLogin) {
        onLogin(response.data.user);
      }

      if (response.data.user.role === 'admin') navigate('/admin');
      else if (response.data.user.role === 'hoca') navigate('/faculty');
      else navigate('/student');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Oturum açılamadı.');
    } finally {
      setLoading(false);
    }
  };

  const updateRegisterForm = (field, value) => {
    setRegisterForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setRegisterError('');
    setRegisterLoading(true);

    try {
      const formData = new FormData();
      formData.append('full_name', registerForm.full_name);
      formData.append('email', registerForm.email);
      formData.append('password', registerForm.password);
      formData.append('department_id', registerForm.department_id);
      formData.append('entry_year', registerForm.entry_year);
      formData.append('transcript', registerForm.transcript);

      const response = await api.post('/auth/register', formData);
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));

      if (onLogin) {
        onLogin(response.data.user);
      }

      navigate('/student');
    } catch (requestError) {
      setRegisterError(requestError.response?.data?.error || 'Öğrenci kaydı oluşturulamadı.');
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="login-grid animate-fade-in">
      <section className="login-brand">
        <p className="eyebrow">Ankara Üniversitesi</p>
        <h1>Bitirme projeniz için danışmanınızı tercih edin.</h1>

      </section>

      <section className="panel login-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">{mode === 'login' ? 'Giriş' : 'Öğrenci Kaydı'}</p>
            <h2>{mode === 'login' ? 'Sisteme erişin' : 'Kendi hesabınızı oluşturun'}</h2>
          </div>
        </div>

        <div className="segmented-control form-tabs" role="group" aria-label="Oturum işlemi">
          <button
            type="button"
            className={`segmented-option ${mode === 'login' ? 'is-active' : ''}`}
            onClick={() => setMode('login')}
          >
            <ArrowRight size={16} />
            Giriş
          </button>
          <button
            type="button"
            className={`segmented-option ${mode === 'register' ? 'is-active' : ''}`}
            onClick={() => setMode('register')}
          >
            <UserPlus size={16} />
            Öğrenci Kaydı
          </button>
        </div>

        <p className="muted-copy">
          {mode === 'login'
            ? 'Kurumsal e-posta adresiniz ve şifreniz ile oturum açın.'
            : 'Transkriptinizdeki ad soyad, GANO, üniversite ve bölüm okunur. Adınız form ile, üniversite ve bölüm bilgileriniz Ankara Üniversitesi Yapay Zeka ve Veri Mühendisliği ile eşleşirse hesabınız anında onaylanır.'}
        </p>

        {mode === 'login' ? (
          <>
            {error && <div className="notice notice-error">{error}</div>}

            <form className="stack-form" onSubmit={handleLogin}>
              <label className="field-block">
                <span>E-posta adresi</span>
                <div className="field-with-icon">
                  <UserRound size={16} />
                  <input
                    type="email"
                    className="app-input"
                    placeholder="örnek@ankara.edu.tr"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
              </label>

              <label className="field-block">
                <span>Şifre</span>
                <div className="field-with-icon">
                  <Lock size={16} />
                  <input
                    type="password"
                    className="app-input"
                    placeholder="En az 8 karakter"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
              </label>

              <button type="submit" className="btn btn-primary btn-wide" disabled={loading}>
                <ArrowRight size={16} />
                {loading ? 'Oturum açılıyor' : 'Devam et'}
              </button>
            </form>
          </>
        ) : (
          <>
            {registerError && <div className="notice notice-error">{registerError}</div>}

            <form className="stack-form" onSubmit={handleRegister}>
              <label className="field-block">
                <span>Ad soyad</span>
                <div className="field-with-icon">
                  <UserRound size={16} />
                  <input
                    type="text"
                    className="app-input"
                    value={registerForm.full_name}
                    onChange={(event) => updateRegisterForm('full_name', event.target.value)}
                    required
                  />
                </div>
              </label>

              <label className="field-block">
                <span>E-posta adresi</span>
                <input
                  type="email"
                  className="app-input"
                  placeholder="ogrenci@ankara.edu.tr"
                  value={registerForm.email}
                  onChange={(event) => updateRegisterForm('email', event.target.value)}
                  required
                />
              </label>

              <div className="duo-grid align-start">
                <label className="field-block">
                  <span>Bölüm</span>
                  <select
                    className="app-input"
                    value={registerForm.department_id}
                    onChange={(event) => updateRegisterForm('department_id', event.target.value)}
                    required
                  >
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-block">
                  <span>Şifre</span>
                  <input
                    type="password"
                    className="app-input"
                    minLength={8}
                    value={registerForm.password}
                    onChange={(event) => updateRegisterForm('password', event.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="duo-grid align-start">
                <label className="field-block">
                  <span>Giriş yılı</span>
                  <input
                    type="number"
                    min="2000"
                    max="2100"
                    className="app-input"
                    value={registerForm.entry_year}
                    onChange={(event) => updateRegisterForm('entry_year', event.target.value)}
                    required
                  />
                </label>
              </div>

              <label className="field-block">
                <span>Transkript PDF</span>
                <div className="field-with-icon">
                  <FileText size={16} />
                  <input
                    type="file"
                    className="app-input"
                    accept="application/pdf"
                    aria-describedby="transcript-help"
                    onChange={(event) => updateRegisterForm('transcript', event.target.files?.[0] || null)}
                    required
                  />
                </div>
              </label>
              <small id="transcript-help">Metni seçilebilen, şifresiz bir PDF yükleyin (en fazla 5 MB). Dört bilgiden biri okunamazsa veya eşleşmezse kayıt oluşturulmaz.</small>

              <button type="submit" className="btn btn-primary btn-wide" disabled={registerLoading}>
                <UserPlus size={16} />
                {registerLoading ? 'Kayıt oluşturuluyor' : 'Öğrenci kaydı oluştur'}
              </button>
            </form>
          </>
        )}
      </section>
      <AssignmentGuide />
    </div>
  );
}
