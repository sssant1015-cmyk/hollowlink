import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { useAuth } from '../api/AuthContext';
import { useToast } from '../utils/toast';
import { Avatar, EmptyState, Modal, PostSkeleton, Spinner } from '../components/ui/Ui';
import { PostCard } from '../components/feed/PostCard';
import { formatDateLong, timeAgo } from '../utils/format';
import type { FullUser, Post, Paged } from '../types/api';

export function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user, setUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const isOwn = !id || id === user?.id;

  const [profile, setProfile] = useState<FullUser | null>(null);
  const [isFriend, setIsFriend] = useState(false);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '', pronouns: '', location: '', customStatus: '' });
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      if (isOwn) {
        const data = await api.get<{ user: FullUser }>('/users/me');
        setProfile(data.user);
        setIsFriend(false);
      } else {
        const data = await api.get<{ user: FullUser; isSelf: boolean; isFriend: boolean }>(`/users/${id}`);
        setProfile(data.user);
        setIsFriend(data.isFriend);
      }
      const targetId = isOwn ? user?.id : id;
      if (targetId) {
        const p = await api.get<Paged<Post>>(`/feed/users/${targetId}?limit=20`);
        setPosts(p.items);
      }
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not load profile', 'error');
    }
  }, [id, isOwn, user?.id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = () => {
    if (!profile) return;
    setForm({
      displayName: profile.displayName,
      bio: profile.bio ?? '',
      pronouns: profile.pronouns ?? '',
      location: profile.location ?? '',
      customStatus: profile.customStatus ?? '',
    });
    setEditing(true);
  };

  const save = async () => {
    try {
      const data = await api.patch<{ user: FullUser }>('/users/me', {
        displayName: form.displayName.trim(),
        bio: form.bio,
        pronouns: form.pronouns || null,
        location: form.location || null,
        customStatus: form.customStatus || null,
      });
      setUser(data.user);
      setEditing(false);
      toast('Profile saved', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not save', 'error');
    }
  };

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      await api.upload<{ avatarUrl: string }>('/users/me/avatar', fd);
      toast('Avatar updated', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const addFriend = async () => {
    if (!profile) return;
    try {
      await api.post('/friends/requests', { userId: profile.id });
      toast('Request sent!', 'success');
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not send request', 'error');
    }
  };

  const message = async () => {
    if (!profile) return;
    try {
      const conv = await api.post<{ id: string }>('/chat/dm', { userId: profile.id });
      navigate(`/app/chat/${conv.id}`);
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not open chat', 'error');
    }
  };

  if (!profile) {
    return (
      <div className="page" style={{ maxWidth: 720 }}>
        <PostSkeleton />
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="card fade-in" style={{ padding: 24 }}>
        <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Avatar name={profile.displayName} url={profile.avatarUrl} size={88} />
            {isOwn && (
              <label
                className="btn btn-sm"
                style={{ position: 'absolute', bottom: -6, right: -6, padding: '4px 8px', cursor: uploading ? 'wait' : 'pointer' }}
                title="Change avatar"
              >
                {uploading ? '…' : '📷'}
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.gif,.webp"
                  style={{ display: 'none' }}
                  onChange={(e) => e.target.files?.[0] && void uploadAvatar(e.target.files[0])}
                />
              </label>
            )}
          </div>
          <div className="grow">
            <h1 style={{ fontSize: 24 }}>{profile.displayName}</h1>
            <p className="muted small">
              @{profile.username}
              {profile.pronouns ? ` · ${profile.pronouns}` : ''}
              {profile.location ? ` · 📍 ${profile.location}` : ''}
            </p>
            {profile.customStatus && <p className="small mt-1">💭 {profile.customStatus}</p>}
            {profile.bio && <p className="small mt-1" style={{ whiteSpace: 'pre-wrap' }}>{profile.bio}</p>}
            {profile.createdAt && <p className="tiny faint mt-1">Joined {formatDateLong(profile.createdAt)}</p>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isOwn ? (
              <button className="btn btn-primary" onClick={startEdit}>Edit profile</button>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => void addFriend()} disabled={isFriend}>
                  {isFriend ? 'Friends ✓' : '＋ Add friend'}
                </button>
                <button className="btn" onClick={() => void message()}>Message</button>
              </>
            )}
          </div>
        </div>
      </div>

      <h2 className="card-title mt-3">Posts</h2>
      {posts === null ? (
        <Spinner />
      ) : posts.length === 0 ? (
        <EmptyState icon="≡" title="No posts yet" body={isOwn ? 'Share your first post from the feed.' : 'Nothing shared here yet.'} action={isOwn ? <Link className="btn" to="/app/feed">Go to feed</Link> : undefined} />
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} onChanged={() => void load()} />)
      )}

      {editing && (
        <Modal title="Edit profile" onClose={() => setEditing(false)}>
          <div className="field">
            <label htmlFor="p-name">Display name</label>
            <input id="p-name" className="input" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} maxLength={48} />
          </div>
          <div className="field">
            <label htmlFor="p-status">Custom status</label>
            <input id="p-status" className="input" value={form.customStatus} onChange={(e) => setForm((f) => ({ ...f, customStatus: e.target.value }))} maxLength={80} placeholder="What's happening?" />
          </div>
          <div className="field">
            <label htmlFor="p-bio">Bio</label>
            <textarea id="p-bio" className="input" rows={3} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} maxLength={500} />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="p-pronouns">Pronouns</label>
              <input id="p-pronouns" className="input" value={form.pronouns} onChange={(e) => setForm((f) => ({ ...f, pronouns: e.target.value }))} maxLength={32} />
            </div>
            <div className="field">
              <label htmlFor="p-loc">Location</label>
              <input id="p-loc" className="input" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} maxLength={64} />
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => void save()}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function ProfileRedirect() {
  const { user } = useAuth();
  if (user) return <ProfilePage />;
  return <Spinner />;
}

export { timeAgo };
