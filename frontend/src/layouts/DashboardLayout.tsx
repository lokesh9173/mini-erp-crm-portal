import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  FileText, 
  LogOut, 
  User as UserIcon,
  Menu
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, title }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} />, roles: ['Admin', 'Sales', 'Warehouse', 'Accounts'] },
    { name: 'CRM Customers', path: '/crm', icon: <Users size={20} />, roles: ['Admin', 'Sales', 'Accounts'] },
    { name: 'Inventory & Stock', path: '/inventory', icon: <Package size={20} />, roles: ['Admin', 'Sales', 'Warehouse', 'Accounts'] },
    { name: 'Sales Challans', path: '/challans', icon: <FileText size={20} />, roles: ['Admin', 'Sales', 'Warehouse', 'Accounts'] },
  ];

  const allowedMenuItems = menuItems.filter(item => user && item.roles.includes(user.role));

  return (
    <div className="app-container">
      {/* Mobile Menu Toggle Button */}
      <button 
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          background: 'var(--bg-glass-card)',
          border: '1px solid var(--border-glass)',
          borderRadius: '8px',
          padding: '8px',
          color: 'white',
          cursor: 'pointer',
          display: 'none',
        }}
        className="mobile-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <Menu size={24} />
      </button>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-icon">E</div>
          <span className="logo-text">Mini ERP + CRM</span>
        </div>

        <nav className="sidebar-menu">
          {allowedMenuItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              {item.icon}
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-badge">
            <span className="user-name">{user?.username}</span>
            <span className="user-role">{user?.role}</span>
          </div>
          <button 
            onClick={handleLogout}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              borderRadius: '6px',
              transition: 'var(--transition)'
            }}
            title="Log Out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="top-bar">
          <h1 className="page-title">{title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} className="top-bar-user">
            <div style={{
              background: 'var(--bg-glass-card)',
              padding: '8px 16px',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              border: '1px solid var(--border-glass)'
            }}>
              <UserIcon size={16} className="text-secondary" />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user?.username} ({user?.role})</span>
            </div>
          </div>
        </header>

        {children}
      </main>

      {/* Responsive Style Overwrite */}
      <style>{`
        @media (max-width: 768px) {
          .mobile-toggle {
            display: block !important;
          }
          .top-bar-user {
            margin-right: 50px;
          }
        }
      `}</style>
    </div>
  );
};
