import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { useToast } from '../utils/toast';
import { Avatar, EmptyState, Modal, PostSkeleton } from '../components/ui/Ui';
import type { Group, Paged } from '../types/api';

export function GroupsPage() {
  const toast = useToast();
  const [mine, setMine] = useState<Paged<Group> | null>(null);
  const [discover, setDiscover] = useState<Paged<Group> | null>(null);
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [form, setForm] = useState({ name: '', description: '', isPrivate: true });

  const load = useCallback(async () => {
    try {
      const [m, d] = await Promise.all([
        api.get<Paged<Group>>('/groups?limit=50'),
        api.get<Paged<Group>>('/groups/discover?limit=20'),
      ]);
      setMine(m);
      setDiscover(d);
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not load groups', 'error');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    try {
      await api.post('/groups', { name: form.name.trim(), description: form.description.trim(), isPrivate: form.isPrivate });
      setCreating(false);
      setForm({ name: '', description: '', isPrivate: true });
      toast('Group created!', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not create group', 'error');
    }
  };

  const joinByCode = async () => {
    try {
      await api.post('/groups/join', { code: joinCode.trim() });
      setJoinCode('');
      toast('Joined!', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Invalid invite code', 'error');
    }
  };

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="row-between mb-3">
        <h1 style={{ fontSize: 24 }}>Groups</h1>
        <div className="row">
          <input
            className="input"
            style={{ width: 170 }}
            placeholder="Invite code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            aria-label="Join with invite code"
          />
          <button className="btn" disabled={!joinCode.trim()} onClick={() => void joinByCode()}>Join</button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>＋ Create</button>
        </div>
      </div>

      <h2 className="card-title">Your groups</h2>
      {mine === null ? (
        <PostSkeleton />
      ) : mine.items.length === 0 ? (
        <div className="card mb-3">
          <EmptyState icon="⬡" title="You're not in any groups" body="Create a private space for your circle, or join one with an invite code." />
        </div>
      ) : (
        <div className="grid grid-2 mb-3">
          {mine.items.map((g) => (
            <Link key={g.id} to={`/app/groups/${g.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="row">
                <Avatar name={g.name} url={g.iconUrl} size={44} />
                <div className="grow">
                  <div className="bold">{g.name}</div>
                  <div className="tiny faint">{g.memberCount} member{g.memberCount === 1 ? '' : 's'} · {g.isPrivate ? 'private' : 'public'}</div>
                </div>
                {g.viewerRole === 'owner' ? <span className="badge">owner</span> : g.viewerRole === 'moderator' ? <span className="badge badge-cyan">mod</span> : null}
              </div>
              {g.description && <p className="small muted mt-1 truncate">{g.description}</p>}
            </Link>
          ))}
        </div>
      )}

      <h2 className="card-title">Public groups you can join</h2>
      {discover === null ? (
        <PostSkeleton />
      ) : discover.items.length === 0 ? (
        <div className="card">
          <EmptyState icon="🌐" title="Nothing public yet" body="Public groups your friends create will show up here." />
        </div>
      ) : (
        <div className="grid grid-3">
          {discover.items.map((g) => (
            <div key={g.id} className="card">
              <div className="row mb-2">
                <Avatar name={g.name} url={g.iconUrl} size={38} />
                <div className="grow">
                  <div className="bold small truncate">{g.name}</div>
                  <div className="tiny faint">{g.memberCount} members</div>
                </div>
              </div>
              <p className="tiny muted" style={{ minHeight: 32 }}>{g.description || 'No description.'}</p>
              <Link className="btn btn-sm btn-block" to={`/app/groups/${g.id}`}>Open</Link>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <Modal title="Create a group" onClose={() => setCreating(false)}>
          <div className="field">
            <label htmlFor="g-name">Name</label>
            <input id="g-name" className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={48} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="g-desc">Description</label>
            <textarea id="g-desc" className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={500} />
          </div>
          <div className="field row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              id="g-priv"
              type="checkbox"
              checked={form.isPrivate}
              onChange={(e) => setForm((f) => ({ ...f, isPrivate: e.target.checked }))}
              style={{ width: 16, height: 16 }}
            />
            <label htmlFor="g-priv" style={{ margin: 0 }}>Private (invite-only)</label>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={form.name.trim().length < 2} onClick={() => void create()}>Create</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
