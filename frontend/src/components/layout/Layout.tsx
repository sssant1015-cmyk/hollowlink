import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../api/AuthContext';
import { api } from '../../api/client';
import { Avatar } from '../ui/Ui';
import type { Notification } from '../../types/api';

const NAV = [
  { to: '/app', label: 'Home', icon: '◈', end: true },
  { to: '/app/friends', label: 'Friends', icon: '⁂' },
  { to: '/app/groups', label: 'Groups', icon: '⬡' },
  { to: '/app/chat', label: 'Chat', icon: '❍' },
  { to: '/app/feed', label: 'Feed', icon: '≡' },
  { to: '/app/events', label: 'Events', icon: '◷' },
];

const NAV_FOOTER = [
  { to: '/app/notifications', label: 'Notifications', icon: '◔' },
  { to: '/app/profile', label: 'Profile', icon: '◎' },
  { to: '/app/settings', label: 'Settings', icon: '⚙' },
];

export function Layout() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await api.get<{ unread: number }>('/notifications?limit=1');
        if (alive) setUnread(data.unread);
      } catch {
        // ignore badge errors
      }
    };
    void load();
    const timer = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const navItem = (item: (typeof NAV)[number], badge?: number) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      aria-label={item.label}
    >
      <span aria-hidden style={{ fontSize: 17, width: 20, textAlign: 'center' }}>
        {item.icon}
      </span>
      <span>{item.label}</span>
      {badge ? <span className="nav-badge">{badge > 99 ? '99+' : badge}</span> : null}
    </NavLink>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span className="brand-word">HollowLink</span>
        </div>
        <nav aria-label="Primary">
          {NAV.map((item) => navItem(item))}
        </nav>
        <div className="sidebar-footer">
          <nav aria-label="Secondary">{NAV_FOOTER.map((item) => navItem(item, item.label === 'Notifications' ? unread : undefined))}</nav>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="search-input-wrap">
            <span className="search-icon" aria-hidden>⌕</span>
            <input
              className="input"
              placeholder="Search HollowLink…"
              aria-label="Search HollowLink"
              onFocus={() => navigate('/app/search')}
              readOnly
            />
          </div>
          <div className="topbar-actions">
            <button className="btn btn-ghost btn-sm" aria-label="Notifications" onClick={() => navigate('/app/notifications')}>
              ◔{unread > 0 && <span className="nav-badge" style={{ marginLeft: 6 }}>{unread}</span>}
            </button>
            <button
              className="btn btn-ghost"
              style={{ padding: 2 }}
              aria-label="Your profile"
              onClick={() => navigate('/app/profile')}
            >
              <Avatar name={user?.displayName ?? 'You'} url={user?.avatarUrl} size={32} />
            </button>
          </div>
        </header>
        <Outlet />
      </div>

      <nav className="bottom-nav" aria-label="Primary mobile">
        <div className="bottom-nav-inner">
          {NAV.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              aria-label={item.label}
            >
              <span aria-hidden style={{ fontSize: 18 }}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export type { Notification };
