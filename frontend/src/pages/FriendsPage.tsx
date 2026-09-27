import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { useToast } from '../utils/toast';
import { Avatar, EmptyState, PostSkeleton } from '../components/ui/Ui';
import { useAuth } from '../api/AuthContext';
import type { PublicUser, FriendRequest, Paged } from '../types/api';

type Tab = 'friends' | 'requests' | 'search' | 'blocked';

export function FriendsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Paged<PublicUser> | null>(null);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [blocked, setBlocked] = useState<PublicUser[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[] | null>(null);
  const [searching, setSearching] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [f, r, b] = await Promise.all([
        api.get<Paged<PublicUser>>('/friends?limit=100'),
        api.get<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>('/friends/requests'),
        api.get<{ items: PublicUser[] }>('/friends/blocked'),
      ]);
      setFriends(f);
      setIncoming(r.incoming);
      setOutgoing(r.outgoing);
      setBlocked(b.items);
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not load friends', 'error');
    }
  }, [toast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (tab !== 'search') return;
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const data = await api.get<Paged<PublicUser>>(`/friends/search?q=${encodeURIComponent(query.trim())}&limit=20`);
        setResults(data.items);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, tab]);

  const sendRequest = async (u: PublicUser) => {
    try {
      await api.post('/friends/requests', { userId: u.id });
      toast(`Request sent to @${u.username}`, 'success');
      setResults((rs) => rs?.filter((r) => r.id !== u.id) ?? null);
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not send request', 'error');
    }
  };

  const accept = async (id: string) => {
    try {
      await api.post(`/friends/requests/${id}/accept`);
      toast('Friend added!', 'success');
      await loadAll();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not accept', 'error');
    }
  };

  const rejectOrCancel = async (id: string) => {
    try {
      await api.delete(`/friends/requests/${id}`);
      await loadAll();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not remove request', 'error');
    }
  };

  const removeFriend = async (u: PublicUser) => {
    try {
      await api.delete(`/friends/${u.id}`);
      toast(`Removed @${u.username}`, 'success');
      await loadAll();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not remove friend', 'error');
    }
  };

  const block = async (u: PublicUser) => {
    try {
      await api.post(`/friends/${u.id}/block`);
      toast(`Blocked @${u.username}`, 'success');
      await loadAll();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not block', 'error');
    }
  };

  const unblock = async (u: PublicUser) => {
    try {
      await api.delete(`/friends/${u.id}/block`);
      toast(`Unblocked @${u.username}`, 'success');
      await loadAll();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not unblock', 'error');
    }
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'friends', label: 'Friends', count: friends?.total },
    { key: 'requests', label: 'Requests', count: incoming.length + outgoing.length },
    { key: 'search', label: 'Find people' },
    { key: 'blocked', label: 'Blocked', count: blocked.length },
  ];

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 24 }} className="mb-3">Friends</h1>

      <div className="row mb-3" style={{ flexWrap: 'wrap', gap: 6 }} role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`btn btn-sm ${tab === t.key ? 'btn-primary' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {tab === 'friends' && (
        <div className="card">
          {friends === null ? (
            <PostSkeleton />
          ) : friends.items.length === 0 ? (
            <EmptyState icon="⁂" title="No friends yet" body="Search for people you know and send a friend request." action={<button className="btn btn-primary btn-sm" onClick={() => setTab('search')}>Find people</button>} />
          ) : (
            friends.items.map((f) => (
              <div key={f.id} className="list-row">
                <Avatar name={f.displayName} url={f.avatarUrl} size={40} />
                <div className="grow">
                  <div className="bold small">{f.displayName}</div>
                  <div className="tiny faint">@{f.username}{f.customStatus ? ` · ${f.customStatus}` : ''}</div>
                </div>
                <Link className="btn btn-ghost btn-sm" to={`/app/profile/${f.id}`}>View</Link>
                <button className="btn btn-ghost btn-sm" onClick={() => void removeFriend(f)}>Remove</button>
                <button className="btn btn-ghost btn-sm" onClick={() => void block(f)} aria-label={`Block ${f.username}`}>⊘</button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'requests' && (
        <div className="card">
          <h2 className="card-title">Incoming</h2>
          {incoming.length === 0 ? (
            <p className="muted small">No pending requests.</p>
          ) : (
            incoming.map((r) => (
              <div key={r.id} className="list-row">
                <Avatar name={r.from?.displayName ?? '?'} url={r.from?.avatarUrl} size={40} />
                <div className="grow">
                  <div className="bold small">{r.from?.displayName}</div>
                  <div className="tiny faint">@{r.from?.username}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => void accept(r.id)}>Accept</button>
                <button className="btn btn-sm" onClick={() => void rejectOrCancel(r.id)}>Reject</button>
              </div>
            ))
          )}
          <hr className="divider" />
          <h2 className="card-title">Sent</h2>
          {outgoing.length === 0 ? (
            <p className="muted small">No outgoing requests.</p>
          ) : (
            outgoing.map((r) => (
              <div key={r.id} className="list-row">
                <Avatar name={r.to?.displayName ?? '?'} url={r.to?.avatarUrl} size={40} />
                <div className="grow small">
                  <strong>{r.to?.displayName}</strong> <span className="tiny faint">@{r.to?.username}</span>
                </div>
                <button className="btn btn-sm" onClick={() => void rejectOrCancel(r.id)}>Cancel</button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'search' && (
        <div className="card">
          <div className="field">
            <label htmlFor="user-search">Search by username or display name</label>
            <input
              id="user-search"
              className="input"
              placeholder="e.g. neo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          {searching ? (
            <p className="muted small">Searching…</p>
          ) : results === null ? (
            <p className="faint small">Type at least 2 characters.</p>
          ) : results.length === 0 ? (
            <p className="muted small">No users found for “{query}”.</p>
          ) : (
            results.map((u) => (
              <div key={u.id} className="list-row">
                <Avatar name={u.displayName} url={u.avatarUrl} size={40} />
                <div className="grow">
                  <div className="bold small">{u.displayName} {u.id === user?.id && <span className="badge badge-gray">you</span>}</div>
                  <div className="tiny faint">@{u.username}</div>
                </div>
                <Link className="btn btn-ghost btn-sm" to={`/app/profile/${u.id}`}>Profile</Link>
                <button className="btn btn-primary btn-sm" onClick={() => void sendRequest(u)}>Add friend</button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'blocked' && (
        <div className="card">
          {blocked.length === 0 ? (
            <EmptyState icon="⊘" title="Nobody blocked" body="Blocked users can't see your profile or send you requests." />
          ) : (
            blocked.map((u) => (
              <div key={u.id} className="list-row">
                <Avatar name={u.displayName} url={u.avatarUrl} size={40} />
                <div className="grow small">
                  <strong>{u.displayName}</strong> <span className="tiny faint">@{u.username}</span>
                </div>
                <button className="btn btn-sm" onClick={() => void unblock(u)}>Unblock</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
