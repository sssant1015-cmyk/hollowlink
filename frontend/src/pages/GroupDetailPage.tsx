import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { useToast } from '../utils/toast';
import { Avatar, ConfirmDialog, EmptyState, Modal, Spinner } from '../components/ui/Ui';
import { PostCard } from '../components/feed/PostCard';
import { timeAgo } from '../utils/format';
import type { Group, Post, Announcement, Event, Paged } from '../types/api';

interface MemberRow {
  user: { id: string; username: string; displayName: string; avatarUrl: string | null };
  role: 'owner' | 'moderator' | 'member';
  joined_at: string;
}

type Tab = 'feed' | 'members' | 'announcements' | 'events';

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('feed');
  const [posts, setPosts] = useState<Post[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [postText, setPostText] = useState('');
  const [announceText, setAnnounceText] = useState({ title: '', body: '' });
  const [creatingAnnouncement, setCreatingAnnouncement] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const isOwner = group?.ownerId === group?.viewerRole && group?.viewerRole === 'owner';
  const isMod = group?.viewerRole === 'owner' || group?.viewerRole === 'moderator';

  const loadGroup = useCallback(async () => {
    if (!id) return;
    try {
      const g = await api.get<Group>(`/groups/${id}`);
      setGroup(g);
      setInviteCode(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load group');
    }
  }, [id]);

  const loadTab = useCallback(async () => {
    if (!id || !group) return;
    try {
      if (tab === 'feed') {
        const data = await api.get<Paged<Post>>(`/feed/groups/${id}?limit=30`);
        setPosts(data.items);
      } else if (tab === 'members') {
        const data = await api.get<{ items: MemberRow[] }>(`/groups/${id}/members?limit=100`);
        setMembers(data.items);
      } else if (tab === 'announcements') {
        const data = await api.get<{ items: Announcement[] }>(`/groups/${id}/announcements?limit=30`);
        setAnnouncements(data.items);
      } else {
        const all = await api.get<Paged<Event>>('/events?scope=all&limit=50');
        setEvents(all.items.filter((e) => e.groupId === id));
      }
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not load tab', 'error');
    }
  }, [id, group, tab, toast]);

  useEffect(() => {
    void loadGroup();
  }, [loadGroup]);

  useEffect(() => {
    void loadTab();
  }, [loadTab]);

  if (error) {
    return (
      <div className="page">
        <EmptyState icon="🔒" title="Cannot open this group" body={error} action={<Link className="btn" to="/app/groups">Back to groups</Link>} />
      </div>
    );
  }
  if (!group) {
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spinner />
      </div>
    );
  }

  const post = async () => {
    const content = postText.trim();
    if (!content || !id) return;
    try {
      await api.post('/feed', { content, groupId: id });
      setPostText('');
      const data = await api.get<Paged<Post>>(`/feed/groups/${id}?limit=30`);
      setPosts(data.items);
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not post', 'error');
    }
  };

  const createAnnouncement = async () => {
    try {
      await api.post(`/groups/${id}/announcements`, { title: announceText.title.trim(), body: announceText.body.trim() });
      setCreatingAnnouncement(false);
      setAnnounceText({ title: '', body: '' });
      toast('Announcement posted — members notified', 'success');
      setTab('announcements');
      await loadTab();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not post announcement', 'error');
    }
  };

  const removeMember = async (memberId: string, name: string) => {
    try {
      await api.post(`/groups/${id}/members/${memberId}/remove`);
      toast(`Removed ${name}`, 'success');
      await loadTab();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not remove member', 'error');
    }
  };

  const setRole = async (memberId: string, role: 'moderator' | 'member') => {
    try {
      await api.post(`/groups/${id}/members/${memberId}/role`, { role });
      await loadTab();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not change role', 'error');
    }
  };

  const leave = async () => {
    try {
      await api.post(`/groups/${id}/leave`);
      toast('Left the group', 'success');
      navigate('/app/groups');
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not leave', 'error');
    }
  };

  const deleteGroup = async () => {
    try {
      await api.delete(`/groups/${id}`);
      toast('Group deleted', 'success');
      navigate('/app/groups');
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not delete', 'error');
    }
  };

  const rotateInvite = async () => {
    try {
      const data = await api.post<{ code: string }>(`/groups/${id}/rotate-invite`);
      setInviteCode(data.code);
      toast('Invite code rotated', 'success');
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not rotate invite', 'error');
    }
  };

  return (
    <div className="page page-wide">
      <div
        style={{
          height: 160,
          borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
          background: group.bannerUrl
            ? `url(${group.bannerUrl}) center/cover`
            : 'linear-gradient(120deg, rgba(168,85,247,0.35), rgba(34,211,238,0.18)), var(--bg-raised)',
        }}
        role="img"
        aria-label={`${group.name} banner`}
      />
      <div className="page" style={{ maxWidth: 960 }}>
        <div className="row-between mb-2" style={{ flexWrap: 'wrap' }}>
          <div className="row">
            <Avatar name={group.name} url={group.iconUrl} size={56} />
            <div>
              <h1 style={{ fontSize: 24 }}>{group.name}</h1>
              <p className="tiny faint">
                {group.memberCount} member{group.memberCount === 1 ? '' : 's'} · {group.isPrivate ? 'private' : 'public'} · you are {group.viewerRole}
              </p>
            </div>
          </div>
          <div className="row">
            {isMod && <button className="btn btn-sm" onClick={() => setCreatingAnnouncement(true)}>📣 Announcement</button>}
            <Link className="btn btn-sm" to={`/app/chat/group/${group.id}`}>💬 Chat</Link>
            {isOwner && <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>Delete</button>}
            {!isOwner && <button className="btn btn-danger btn-sm" onClick={() => void leave()}>Leave</button>}
          </div>
        </div>
        {group.description && <p className="muted small mb-3">{group.description}</p>}
        {isOwner && (
          <p className="tiny faint mb-3">
            Invite code: <code style={{ color: 'var(--cyan-soft)' }}>{inviteCode ?? 'rotated — share from here'}</code>{' '}
            <button className="btn btn-ghost btn-sm" onClick={() => void rotateInvite()}>rotate</button>
          </p>
        )}

        <div className="row mb-3" role="tablist" style={{ gap: 6 }}>
          {(['feed', 'members', 'announcements', 'events'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'feed' && (
          <>
            <div className="card mb-3">
              <textarea
                className="input"
                rows={2}
                placeholder={`Share with ${group.name}…`}
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                maxLength={4000}
                aria-label="Write a group post"
              />
              <div className="row mt-1" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" disabled={!postText.trim()} onClick={() => void post()}>Post</button>
              </div>
            </div>
            {posts.length === 0 ? (
              <EmptyState icon="≡" title="No posts yet" body="Start the conversation." />
            ) : (
              posts.map((p) => <PostCard key={p.id} post={p} onChanged={() => void loadTab()} />)
            )}
          </>
        )}

        {tab === 'members' && (
          <div className="card">
            {members.map((m) => (
              <div key={m.user.id} className="list-row">
                <Avatar name={m.user.displayName} url={m.user.avatarUrl} size={38} />
                <div className="grow">
                  <div className="small bold">{m.user.displayName} {m.user.id === group.ownerId && <span className="badge">owner</span>}{m.role === 'moderator' && <span className="badge badge-cyan">mod</span>}</div>
                  <div className="tiny faint">@{m.user.username} · joined {timeAgo(m.joined_at)}</div>
                </div>
                {isMod && m.user.id !== group.ownerId && (
                  <>
                    {m.role === 'member' ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => void setRole(m.user.id, 'moderator')}>Make mod</button>
                    ) : m.role === 'moderator' ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => void setRole(m.user.id, 'member')}>Remove mod</button>
                    ) : null}
                    <button className="btn btn-ghost btn-sm" onClick={() => void removeMember(m.user.id, m.user.displayName)}>Remove</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'announcements' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {announcements.length === 0 ? (
              <EmptyState icon="📣" title="No announcements" body={isMod ? 'Post the first announcement to keep everyone in the loop.' : 'Moderators haven\'t posted any announcements yet.'} />
            ) : (
              announcements.map((a) => (
                <div key={a.id} className={`card ${a.pinned ? '' : ''}`} style={a.pinned ? { borderColor: 'rgba(168,85,247,0.4)' } : {}}>
                  <div className="row-between">
                    <h3 style={{ fontSize: 16 }}>{a.pinned ? '📌 ' : ''}{a.title}</h3>
                    {isMod && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={async () => {
                          try {
                            await api.delete(`/groups/${id}/announcements/${a.id}`);
                            await loadTab();
                          } catch {
                            toast('Could not delete', 'error');
                          }
                        }}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                  <p className="small mt-1" style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p>
                  <p className="tiny faint mt-1">by {a.author.displayName} · {timeAgo(a.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'events' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {events.length === 0 ? (
              <EmptyState icon="◷" title="No events" body="Events created for this group will appear here." action={<Link to="/app/events" className="btn btn-sm">Create event</Link>} />
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="card">
                  <div className="row-between">
                    <div>
                      <h3 style={{ fontSize: 16 }}>{ev.title}</h3>
                      <p className="tiny faint">{new Date(`${ev.date}T00:00:00`).toLocaleDateString()} · {ev.startTime}{ev.location ? ` · ${ev.location}` : ''}</p>
                    </div>
                    <span className="badge badge-green">{ev.attendees.going} going</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {creatingAnnouncement && (
        <Modal title="New announcement" onClose={() => setCreatingAnnouncement(false)}>
          <div className="field">
            <label htmlFor="ann-title">Title</label>
            <input id="ann-title" className="input" value={announceText.title} onChange={(e) => setAnnounceText((t) => ({ ...t, title: e.target.value }))} maxLength={120} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="ann-body">Body</label>
            <textarea id="ann-body" className="input" rows={4} value={announceText.body} onChange={(e) => setAnnounceText((t) => ({ ...t, body: e.target.value }))} maxLength={4000} />
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setCreatingAnnouncement(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={!announceText.title.trim() || !announceText.body.trim()} onClick={() => void createAnnouncement()}>Publish</button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete group?"
          message="This deletes the group, its posts, chat history and events. This cannot be undone."
          confirmLabel="Delete forever"
          danger
          onConfirm={() => {
            setConfirmDelete(false);
            void deleteGroup();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
