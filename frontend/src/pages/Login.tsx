import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, API_BASE_URL } from '../context/AuthContext';
import { 
  User, 
  Lock, 
  Shield, 
  Briefcase, 
  Boxes, 
  CreditCard, 
  ArrowRight 
} from 'lucide-react';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (data.success) {
        login(data.token, data.user);
        navigate('/');
      } else {
        setError(data.message || 'Invalid username or password');
      }
    } catch (err) {
      setError('Network error. Is the backend server running?');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoAutofill = (role: 'admin' | 'sales' | 'warehouse' | 'accounts') => {
    setUsername(role);
    setPassword(`${role}123`);
    setError(null);
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        {/* Brand Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <div className="logo-icon" style={{ 
            width: '44px', 
            height: '44px', 
            fontSize: '1.4rem',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
          }}>E</div>
        </div>

        {/* Headings */}
        <h2 className="auth-title">Welcome back</h2>
        <p className="auth-subtitle">Log in to your Mini ERP + CRM account</p>

        {error && (
          <div className="alert-card alert-danger" style={{ 
            background: 'rgba(239,68,68,0.08)', 
            border: '1px solid rgba(239,68,68,0.15)', 
            color: '#fca5a5', 
            padding: '12px 16px', 
            borderRadius: '8px', 
            fontSize: '0.85rem', 
            marginBottom: '16px' 
          }}>
            {error}
          </div>
        )}

        {/* Form fields */}
        <form onSubmit={handleLogin}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '6px' }}>Username</label>
            <div className="login-input-wrapper">
              <User className="input-icon" size={18} />
              <input
                type="text"
                className="form-control"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '6px' }}>Password</label>
            <div className="login-input-wrapper">
              <Lock className="input-icon" size={18} />
              <input
                type="password"
                className="form-control"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn-login"
            disabled={submitting}
          >
            {submitting ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        {/* Demo Credentials Box */}
        <div className="demo-accounts-box">
          <h4 className="demo-title">Demo Accounts</h4>
          <p className="demo-subtitle">Use a demo account to explore role-based access.</p>
          
          <div className="demo-grid">
            {/* Admin */}
            <div className="demo-card" onClick={() => handleDemoAutofill('admin')} role="button" tabIndex={0}>
              <div className="demo-card-header">
                <Shield size={14} style={{ color: 'var(--primary-hover)' }} />
                <span>Admin</span>
              </div>
              <div className="demo-card-username">admin</div>
              <div className="demo-card-action">
                <span>Use account</span>
                <ArrowRight size={10} />
              </div>
            </div>

            {/* Sales */}
            <div className="demo-card" onClick={() => handleDemoAutofill('sales')} role="button" tabIndex={0}>
              <div className="demo-card-header">
                <Briefcase size={14} style={{ color: 'var(--accent)' }} />
                <span>Sales</span>
              </div>
              <div className="demo-card-username">sales</div>
              <div className="demo-card-action">
                <span>Use account</span>
                <ArrowRight size={10} />
              </div>
            </div>

            {/* Warehouse */}
            <div className="demo-card" onClick={() => handleDemoAutofill('warehouse')} role="button" tabIndex={0}>
              <div className="demo-card-header">
                <Boxes size={14} style={{ color: 'var(--success)' }} />
                <span>Warehouse</span>
              </div>
              <div className="demo-card-username">warehouse</div>
              <div className="demo-card-action">
                <span>Use account</span>
                <ArrowRight size={10} />
              </div>
            </div>

            {/* Accounts */}
            <div className="demo-card" onClick={() => handleDemoAutofill('accounts')} role="button" tabIndex={0}>
              <div className="demo-card-header">
                <CreditCard size={14} style={{ color: 'var(--warning)' }} />
                <span>Accounts</span>
              </div>
              <div className="demo-card-username">accounts</div>
              <div className="demo-card-action">
                <span>Use account</span>
                <ArrowRight size={10} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
