import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { useToast } from '../utils/toast';
import { Avatar, EmptyState, Spinner } from '../components/ui/Ui';
import { timeAgo } from '../utils/format';
import type { Notification, Paged } from '../types/api';

const TYPE_ICON: Record<string, string> = {
  friend_request: '⁂',
  friend_accepted: '🤝',
  group_invite: '⬡',
  announcement: '📣',
  reaction: '💜',
  comment: '💬',
  message: '✉️',
  event: '◷',
  system: '◈',
};

export function NotificationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Paged<Notification> & { unread: number }>(
        `/notifications?limit=50${unreadOnly ? '&unreadOnly=true' : ''}`,
      );
      setItems(data.items);
      setUnreadCount(data.unread);
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not load notifications', 'error');
    }
  }, [unreadOnly, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string) => {
    await api.post(`/notifications/${id}/read`).catch(() => {});
    await load();
  };

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all');
      toast('All marked as read', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not mark all', 'error');
    }
  };

  const linkFor = (n: Notification): string => {
    switch (n.entityType) {
      case 'user':
        return `/app/profile/${n.entityId}`;
      case 'group':
        return `/app/groups/${n.entityId}`;
      case 'post':
        return '/app/feed';
      case 'event':
        return '/app/events';
      default:
        return '/app';
    }
  };

  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <div className="row-between mb-3">
        <h1 style={{ fontSize: 24 }}>
          Notifications {unreadCount > 0 && <span className="nav-badge" style={{ verticalAlign: 'middle' }}>{unreadCount}</span>}
        </h1>
        <div className="row">
          <button className={`btn btn-sm ${unreadOnly ? 'btn-primary' : ''}`} onClick={() => setUnreadOnly((v) => !v)} aria-pressed={unreadOnly}>
            Unread only
          </button>
          <button className="btn btn-sm" disabled={unreadCount === 0} onClick={() => void markAll()}>
            Mark all read
          </button>
        </div>
      </div>

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon="◔" title="You're all caught up" body={unreadOnly ? 'No unread notifications.' : 'Friend requests, reactions and announcements will land here.'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((n) => (
            <Link
              key={n.id}
              to={linkFor(n)}
              className="card list-row fade-in"
              style={{
                textDecoration: 'none',
                color: 'inherit',
                borderColor: n.read ? undefined : 'rgba(168,85,247,0.45)',
                background: n.read ? undefined : 'rgba(168,85,247,0.06)',
              }}
              onClick={() => void markRead(n.id)}
            >
              {n.actor ? (
                <Avatar name={n.actor.displayName} url={n.actor.avatarUrl} size={40} />
              ) : (
                <span style={{ fontSize: 22 }} aria-hidden>{TYPE_ICON[n.type] ?? '◈'}</span>
              )}
              <div className="grow">
                <div className="small bold">{n.title}</div>
                {n.body && <div className="tiny muted">{n.body}</div>}
                <div className="tiny faint">{timeAgo(n.createdAt)}</div>
              </div>
              {!n.read && <span className="presence-dot online" style={{ position: 'static' }} aria-label="unread" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
