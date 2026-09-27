import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { useToast } from '../utils/toast';
import { Avatar, EmptyState, Spinner } from '../components/ui/Ui';
import { timeAgo } from '../utils/format';
import type { PublicUser, Group } from '../types/api';

interface SearchResults {
  users: PublicUser[];
  groups: Group[];
  posts: { id: string; content: string; createdAt: string; author: { username: string; displayName: string } }[];
}

export function SearchPage() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const data = await api.get<SearchResults>(`/search?q=${encodeURIComponent(query.trim())}&limit=10`);
        setResults(data);
      } catch (err) {
        toast(err instanceof ApiClientError ? err.message : 'Search failed', 'error');
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, toast]);

  const hasAny = results && (results.users.length > 0 || results.groups.length > 0 || results.posts.length > 0);

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 24 }} className="mb-3">Search</h1>
      <div className="field">
        <label htmlFor="g-search">Search users, groups and posts</label>
        <input
          id="g-search"
          className="input"
          placeholder="Start typing…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {searching && <Spinner />}

      {!searching && results && !hasAny && (
        <EmptyState icon="⌕" title="No results" body={`Nothing matched “${query}”.`} />
      )}

      {results && results.users.length > 0 && (
        <>
          <h2 className="card-title mt-3">People</h2>
          <div className="card">
            {results.users.map((u) => (
              <Link key={u.id} to={`/app/profile/${u.id}`} className="list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                <Avatar name={u.displayName} url={u.avatarUrl} size={38} />
                <div className="grow">
                  <div className="small bold">{u.displayName}</div>
                  <div className="tiny faint">@{u.username}</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {results && results.groups.length > 0 && (
        <>
          <h2 className="card-title mt-3">Groups</h2>
          <div className="card">
            {results.groups.map((g) => (
              <Link key={g.id} to={`/app/groups/${g.id}`} className="list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                <Avatar name={g.name} url={g.iconUrl} size={38} />
                <div className="grow">
                  <div className="small bold">{g.name}</div>
                  <div className="tiny faint">{g.memberCount} members · {g.isPrivate ? 'private' : 'public'}</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {results && results.posts.length > 0 && (
        <>
          <h2 className="card-title mt-3">Posts</h2>
          <div className="card">
            {results.posts.map((p) => (
              <Link key={p.id} to="/app/feed" className="list-row" style={{ textDecoration: 'none', color: 'inherit', alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="small">{p.content.length > 120 ? `${p.content.slice(0, 120)}…` : p.content}</div>
                  <div className="tiny faint">@{p.author.username} · {timeAgo(p.createdAt)}</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {!results && !searching && (
        <EmptyState icon="⌕" title="Find your people" body="Search for usernames, group names, and posts from your circles." />
      )}
    </div>
  );
}
