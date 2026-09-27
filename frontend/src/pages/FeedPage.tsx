import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '../api/client';
import { useToast } from '../utils/toast';
import { PostCard } from '../components/feed/PostCard';
import { PostSkeleton, EmptyState, Spinner } from '../components/ui/Ui';
import { useAuth } from '../api/AuthContext';
import type { Post, Group, Paged } from '../types/api';

const PAGE = 10;

export function FeedPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [text, setText] = useState('');
  const [groupId, setGroupId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (offset: number) => {
    const data = await api.get<Paged<Post>>(`/feed?limit=${PAGE}&offset=${offset}`);
    return data;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const data = await load(0);
        setPosts(data.items);
        setTotal(data.total);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Could not load feed');
      } finally {
        setLoading(false);
      }
    })();
    void api.get<Paged<Group>>('/groups?limit=50').then((d) => setGroups(d.items)).catch(() => {});
  }, [load]);

  // Infinite scroll
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(async (entries) => {
      if (entries[0]?.isIntersecting && !loadingMore && posts.length < total) {
        setLoadingMore(true);
        try {
          const data = await load(posts.length);
          setPosts((prev) => [...prev, ...data.items]);
          setTotal(data.total);
        } catch {
          // stop trying on failure
        } finally {
          setLoadingMore(false);
        }
      }
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [posts.length, total, loadingMore, load]);

  const submitPost = async () => {
    const content = text.trim();
    if (!content) return;
    setPosting(true);
    try {
      const fd = new FormData();
      fd.append('content', content);
      if (groupId) fd.append('groupId', groupId);
      if (file) fd.append('image', file);
      await api.upload('/feed', fd);
      setText('');
      setFile(null);
      setGroupId('');
      const data = await load(0);
      setPosts(data.items);
      setTotal(data.total);
      toast('Posted!', 'success');
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not post', 'error');
    } finally {
      setPosting(false);
    }
  };

  const refresh = useCallback(async () => {
    try {
      const data = await load(0);
      setPosts(data.items);
      setTotal(data.total);
    } catch {
      // transient
    }
  }, [load]);

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 24 }} className="mb-3">Feed</h1>

      {user && (
        <div className="card mb-3">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <textarea
                className="input"
                placeholder={`What's new, ${user.displayName.split(' ')[0]}?`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={4000}
                rows={2}
                aria-label="Compose a post"
              />
              <div className="row mt-1" style={{ justifyContent: 'space-between' }}>
                <div className="row">
                  <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                    🖼 {file ? file.name.slice(0, 18) : 'Image'}
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.gif,.webp"
                      style={{ display: 'none' }}
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {groups.length > 0 && (
                    <select className="input" style={{ width: 'auto', padding: '6px 10px' }} value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Post to group">
                      <option value="">No group</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <button className="btn btn-primary btn-sm" disabled={!text.trim() || posting} onClick={() => void submitPost()}>
                  {posting ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <>
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </>
      ) : error ? (
        <EmptyState icon="⚠" title="Could not load your feed" body={error} />
      ) : posts.length === 0 ? (
        <EmptyState icon="≡" title="Your feed is empty" body="Add friends and join groups to start seeing posts here — or share the first one yourself." />
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} onChanged={() => void refresh()} />)
      )}

      <div ref={sentinel} />
      {loadingMore && <Spinner />}
      {!loading && posts.length > 0 && posts.length >= total && (
        <p className="tiny faint" style={{ textAlign: 'center', padding: 16 }}>You're all caught up ✨</p>
      )}
    </div>
  );
}
