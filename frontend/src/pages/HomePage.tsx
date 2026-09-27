import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../api/AuthContext';
import { Avatar, EmptyState, PostSkeleton } from '../components/ui/Ui';
import { getSocket } from '../api/socket';
import { formatEventDate, formatTime } from '../utils/format';
import type { Group, Post, Event, PublicUser, Paged } from '../types/api';

interface PresenceMap {
  [userId: string]: 'online' | 'away' | 'offline';
}

export function HomePage() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Paged<PublicUser> | null>(null);
  const [groups, setGroups] = useState<Paged<Group> | null>(null);
  const [events, setEvents] = useState<Paged<Event> | null>(null);
  const [posts, setPosts] = useState<Paged<Post> | null>(null);
  const [presence, setPresence] = useState<PresenceMap>({});

  useEffect(() => {
    void api.get<Paged<PublicUser>>('/friends?limit=50').then(setFriends).catch(() => setFriends({ items: [], total: 0 }));
    void api.get<Paged<Group>>('/groups?limit=6').then(setGroups).catch(() => setGroups({ items: [], total: 0 }));
    void api.get<Paged<Event>>('/events?scope=upcoming&limit=5').then(setEvents).catch(() => setEvents({ items: [], total: 0 }));
    void api.get<Paged<Post>>('/feed?limit=5').then(setPosts).catch(() => setPosts({ items: [], total: 0 }));
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const onPresence = (p: { userId: string; status: 'online' | 'away' | 'offline' }) => {
      setPresence((prev) => ({ ...prev, [p.userId]: p.status }));
    };
    const onList = (p: { online: string[] }) => {
      setPresence((prev) => {
        const next: PresenceMap = { ...prev };
        for (const id of Object.keys(next)) next[id] = 'offline';
        for (const id of p.online) next[id] = 'online';
        return next;
      });
    };
    socket.on('presence:update', onPresence);
    socket.on('presence:list', onList);
    return () => {
      socket.off('presence:update', onPresence);
      socket.off('presence:list', onList);
    };
  }, []);

  const statusOf = (id: string): 'online' | 'away' | 'offline' => presence[id] ?? 'offline';

  return (
    <div className="page">
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>
        Welcome back, <span style={{ color: 'var(--purple-soft)' }}>{user?.displayName?.split(' ')[0]}</span>
      </h1>
      <p className="muted mb-3">Your circle at a glance.</p>

      <div className="grid grid-2">
        <section className="card" aria-label="Friends">
          <div className="row-between mb-2">
            <h2 className="card-title" style={{ marginBottom: 0 }}>Friends · {friends?.total ?? '…'}</h2>
            <Link to="/app/friends" className="small">View all →</Link>
          </div>
          {friends === null ? (
            <Skeletons />
          ) : friends.items.length === 0 ? (
            <EmptyState icon="⁂" title="No friends yet" body="Find people by username to send your first friend request." action={<Link className="btn btn-sm" to="/app/friends">Find friends</Link>} />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {friends.items.slice(0, 12).map((f) => (
                <Link key={f.id} to={`/app/profile/${f.id}`} style={{ textAlign: 'center', textDecoration: 'none' }} title={f.displayName}>
                  <Avatar name={f.displayName} url={f.avatarUrl} size={52} status={statusOf(f.id)} />
                  <div className="tiny muted truncate mt-1" style={{ width: 60 }}>{f.displayName}</div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="card" aria-label="Groups">
          <div className="row-between mb-2">
            <h2 className="card-title" style={{ marginBottom: 0 }}>Your groups</h2>
            <Link to="/app/groups" className="small">View all →</Link>
          </div>
          {groups === null ? (
            <Skeletons />
          ) : groups.items.length === 0 ? (
            <EmptyState icon="⬡" title="No groups yet" body="Create a private group or join one with an invite code." action={<Link className="btn btn-sm" to="/app/groups">Explore groups</Link>} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {groups.items.slice(0, 5).map((g) => (
                <Link key={g.id} to={`/app/groups/${g.id}`} className="list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <Avatar name={g.name} url={g.iconUrl} size={36} />
                  <div className="grow">
                    <div className="bold small truncate">{g.name}</div>
                    <div className="tiny faint">{g.memberCount} member{g.memberCount === 1 ? '' : 's'}{g.isPrivate ? ' · private' : ''}</div>
                  </div>
                  <span className="badge">{g.viewerRole}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="card" aria-label="Upcoming events">
          <div className="row-between mb-2">
            <h2 className="card-title" style={{ marginBottom: 0 }}>Upcoming events</h2>
            <Link to="/app/events" className="small">All events →</Link>
          </div>
          {events === null ? (
            <Skeletons />
          ) : events.items.length === 0 ? (
            <EmptyState icon="◷" title="Nothing scheduled" body="Create an event or RSVP to one from your groups." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {events.items.map((ev) => (
                <div key={ev.id} className="list-row">
                  <div style={{ fontSize: 20 }} aria-hidden>◷</div>
                  <div className="grow">
                    <div className="bold small truncate">{ev.title}</div>
                    <div className="tiny faint">
                      {formatEventDate(ev.date)} · {formatTime(ev.startTime)}
                      {ev.location ? ` · ${ev.location}` : ''}
                    </div>
                  </div>
                  <span className={`badge ${ev.attendees.viewerResponse === 'going' ? 'badge-green' : 'badge-gray'}`}>
                    {ev.attendees.viewerResponse?.replace('_', ' ') ?? 'rsvp?'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card" aria-label="Recent activity">
          <div className="row-between mb-2">
            <h2 className="card-title" style={{ marginBottom: 0 }}>Recent activity</h2>
            <Link to="/app/feed" className="small">Full feed →</Link>
          </div>
          {posts === null ? (
            <Skeletons />
          ) : posts.items.length === 0 ? (
            <EmptyState icon="≡" title="All quiet" body="Be the first to share something with your circle." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {posts.items.slice(0, 4).map((p) => (
                <div key={p.id} className="row">
                  <Avatar name={p.author.displayName} url={p.author.avatarUrl} size={32} />
                  <div className="grow">
                    <div className="small truncate">
                      <strong>{p.author.displayName}</strong> {p.groupId ? 'posted in a group' : 'posted'}:{' '}
                      <span className="muted">{p.content.slice(0, 70)}{p.content.length > 70 ? '…' : ''}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Skeletons() {
  return (
    <div>
      <PostSkeleton />
    </div>
  );
}
