import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, ApiClientError } from '../api/AuthContext';
import { api } from '../api/client';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '', displayName: '', inviteCode: '' });
  const [inviteRequired, setInviteRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .get<{ inviteRequired: boolean }>('/auth/registration-config')
      .then((d) => setInviteRequired(d.inviteRequired))
      .catch(() => setInviteRequired(false));
  }, []);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({ ...form, inviteCode: form.inviteCode || undefined });
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not create your account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card fade-in">
        <div className="row mb-3">
          <img src="/favicon.svg" alt="" width={34} height={34} />
          <span className="brand-word" style={{ fontSize: 22 }}>HollowLink</span>
        </div>
        <h1>Create your space</h1>
        <p className="subtitle">Your people. Your space. Your link.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="displayName">Display name</label>
            <input id="displayName" className="input" value={form.displayName} onChange={set('displayName')} required maxLength={48} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input id="username" className="input" value={form.username} onChange={set('username')} required pattern="[A-Za-z0-9_]{3,24}" autoComplete="username" />
            <span className="form-hint">3–24 characters · letters, numbers, underscore</span>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" className="input" value={form.email} onChange={set('email')} required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" className="input" value={form.password} onChange={set('password')} required minLength={10} autoComplete="new-password" />
            <span className="form-hint">At least 10 characters, with a letter and a number</span>
          </div>
          {inviteRequired && (
            <div className="field">
              <label htmlFor="invite">Invite code</label>
              <input id="invite" className="input" value={form.inviteCode} onChange={set('inviteCode')} required autoComplete="off" />
              <span className="form-hint">Ask the person who invited you for the code</span>
            </div>
          )}
          {error && <p className="form-error mb-2" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p className="small muted mt-3" style={{ textAlign: 'center' }}>
          Already linked? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
