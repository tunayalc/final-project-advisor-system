import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import FacultyDashboard from './pages/FacultyDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Navbar from './components/Navbar';

const DASHBOARD_BY_ROLE = {
  admin: '/admin',
  hoca: '/faculty',
  ogrenci: '/student',
};

function readStoredSession() {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');

  if (!token || !userStr) {
    return { token: null, user: null };
  }

  try {
    return {
      token,
      user: JSON.parse(userStr),
    };
  } catch {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return { token: null, user: null };
  }
}

function ProtectedRoute({ children, allowedRoles }) {
  const { token, user } = readStoredSession();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={DASHBOARD_BY_ROLE[user.role] || '/login'} replace />;
  }

  return children;
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(() => readStoredSession().user);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname === '/') {
      navigate(user ? (DASHBOARD_BY_ROLE[user.role] || '/login') : '/login');
    }
  }, [navigate, user, location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    navigate('/login');
  };

  return (
    <div className="app-shell">
      {user && <Navbar user={user} onLogout={handleLogout} />}

      <main className={user ? 'page-shell' : 'login-shell'}>
        <Routes>
          <Route path="/login" element={<Login onLogin={(nextUser) => setUser(nextUser)} />} />

          <Route
            path="/student"
            element={(
              <ProtectedRoute allowedRoles={['ogrenci']}>
                <StudentDashboard user={user} />
              </ProtectedRoute>
            )}
          />

          <Route
            path="/faculty"
            element={(
              <ProtectedRoute allowedRoles={['hoca']}>
                <FacultyDashboard user={user} />
              </ProtectedRoute>
            )}
          />

          <Route
            path="/admin"
            element={(
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard user={user} />
              </ProtectedRoute>
            )}
          />

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route
            path="*"
            element={(
              <section className="panel panel-centered">
                <p className="eyebrow">404</p>
                <h2>Sayfa bulunamadı</h2>
                <p className="muted-copy">
                  Bağlantı güncel değil veya bu ekrana erişim izniniz bulunmuyor.
                </p>
              </section>
            )}
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
