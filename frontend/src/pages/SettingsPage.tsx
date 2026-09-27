import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { useAuth } from '../api/AuthContext';
import { useToast } from '../utils/toast';

const NOTIF_PREFS: { key: string; label: string }[] = [
  { key: 'friendRequests', label: 'Friend requests' },
  { key: 'reactions', label: 'Reactions to my posts' },
  { key: 'comments', label: 'Comments on my posts' },
  { key: 'announcements', label: 'Group announcements' },
  { key: 'events', label: 'Event invites & RSVPs' },
  { key: 'messages', label: 'Message activity' },
];

function NotificationPrefsSection() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    void api
      .get<{ preferences: Record<string, boolean> }>('/notifications/preferences')
      .then((d) => setPrefs(d.preferences))
      .catch(() => setPrefs({}));
  }, []);

  const toggle = async (key: string) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: prefs[key] === false };
    setPrefs(next); // optimistic
    try {
      await api.put('/notifications/preferences', { preferences: next });
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not save', 'error');
      setPrefs(prefs);
    }
  };

  return (
    <section className="card mb-3" aria-label="Notification preferences">
      <h2 className="card-title">Notification preferences</h2>
      {prefs === null ? (
        <p className="muted small">Loading…</p>
      ) : (
        NOTIF_PREFS.map(({ key, label }) => (
          <div key={key} className="list-row" style={{ padding: '8px 0' }}>
            <span className="small grow">{label}</span>
            <button
              className={`btn btn-sm ${prefs[key] === false ? '' : 'btn-primary'}`}
              onClick={() => void toggle(key)}
              aria-pressed={prefs[key] !== false}
            >
              {prefs[key] === false ? 'Off' : 'On'}
            </button>
          </div>
        ))
      )}
      <p className="form-hint">System notices (e.g. password resets) are always delivered.</p>
    </section>
  );
}

export function SettingsPage() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  const changePassword = async () => {
    setSavingPw(true);
    try {
      await api.post('/auth/password', { currentPassword: pw.current, newPassword: pw.next });
      toast('Password changed — please sign in again', 'success');
      await logout();
      navigate('/login');
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not change password', 'error');
    } finally {
      setSavingPw(false);
    }
  };

  const savePrivacy = async (patch: Record<string, string>) => {
    setSavingPrivacy(true);
    try {
      const data = await api.patch<{ user: typeof user }>('/users/me', patch);
      if (data.user) setUser(data.user);
      toast('Privacy updated', 'success');
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not save', 'error');
    } finally {
      setSavingPrivacy(false);
    }
  };

  const deleteAccount = async () => {
    try {
      await api.delete('/auth/me', { password: deletePassword });
      toast('Account deleted. Goodbye.', 'success');
      await logout();
      navigate('/');
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not delete account', 'error');
    }
  };

  if (!user) return null;

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 24 }} className="mb-3">Settings</h1>

      <section className="card mb-3" aria-label="Appearance shortcuts">
        <h2 className="card-title">Appearance</h2>
        <p className="small muted mb-2">Themes, fonts, text size, animations and effects live on their own page.</p>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/app/settings/appearance')}>
          Open appearance settings
        </button>
      </section>

      <section className="card mb-3" aria-label="Account">
        <h2 className="card-title">Account</h2>
        <div className="list-row" style={{ padding: '8px 0' }}>
          <div className="grow">
            <div className="small bold">{user.displayName}</div>
            <div className="tiny faint">@{user.username} · {user.email}</div>
          </div>
          <span className={`badge ${user.emailVerified ? 'badge-green' : 'badge-yellow'}`}>
            {user.emailVerified ? 'verified' : 'email not verified'}
          </span>
        </div>
        <p className="tiny faint">Member since {new Date(user.createdAt).toLocaleDateString()}</p>
      </section>

      <section className="card mb-3" aria-label="Privacy">
        <h2 className="card-title">Privacy</h2>
        <div className="field">
          <label htmlFor="s-profile">Who can see my profile</label>
          <select
            id="s-profile"
            className="input"
            value={user.privacyProfile}
            disabled={savingPrivacy}
            onChange={(e) => void savePrivacy({ privacyProfile: e.target.value })}
          >
            <option value="public">Everyone</option>
            <option value="friends">Friends only</option>
            <option value="private">Only me</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="s-presence">Who can see when I'm active</label>
          <select
            id="s-presence"
            className="input"
            value={user.privacyPresence}
            disabled={savingPrivacy}
            onChange={(e) => void savePrivacy({ privacyPresence: e.target.value })}
          >
            <option value="public">Everyone</option>
            <option value="friends">Friends only</option>
            <option value="private">Only me</option>
          </select>
        </div>
        <p className="form-hint">HollowLink presence only reflects activity in this app — nothing is collected from your devices.</p>
      </section>

      <NotificationPrefsSection />

      <section className="card mb-3" aria-label="Change password">
        <h2 className="card-title">Change password</h2>
        <div className="field">
          <label htmlFor="s-cur">Current password</label>
          <input id="s-cur" type="password" className="input" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} autoComplete="current-password" />
        </div>
        <div className="field">
          <label htmlFor="s-new">New password</label>
          <input id="s-new" type="password" className="input" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} autoComplete="new-password" />
          <span className="form-hint">At least 10 characters with a letter and a number</span>
        </div>
        <button className="btn btn-primary" disabled={!pw.current || pw.next.length < 10 || savingPw} onClick={() => void changePassword()}>
          {savingPw ? 'Saving…' : 'Update password'}
        </button>
      </section>

      <section className="card mb-3" aria-label="Session">
        <h2 className="card-title">Session</h2>
        <p className="small muted mb-2">Sessions last 7 days. Changing your password signs out all devices.</p>
        <button className="btn" onClick={() => void logout().then(() => navigate('/login'))}>Sign out</button>
      </section>

      <section className="card" aria-label="Danger zone" style={{ borderColor: 'rgba(248,113,113,0.3)' }}>
        <h2 className="card-title" style={{ color: 'var(--danger)' }}>Danger zone</h2>
        <p className="small muted mb-2">
          Deleting your account permanently removes your profile, posts, messages and memberships. This cannot be undone.
        </p>
        <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Delete my account</button>
      </section>

      {confirmDelete && (
        <div className="mt-2">
          <input
            type="password"
            className="input"
            placeholder="Confirm password to delete"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            aria-label="Confirm password to delete account"
          />
          <div className="row mt-2" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button className="btn btn-danger" disabled={!deletePassword} onClick={() => void deleteAccount()}>
              Delete forever
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
