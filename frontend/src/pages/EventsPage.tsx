import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { useToast } from '../utils/toast';
import { Avatar, EmptyState, Modal, Spinner } from '../components/ui/Ui';
import { formatEventDate, formatTime } from '../utils/format';
import type { Event, Group, Paged } from '../types/api';

export function EventsPage() {
  const toast = useToast();
  const [scope, setScope] = useState<'upcoming' | 'all'>('upcoming');
  const [events, setEvents] = useState<Event[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    date: '',
    startTime: '18:00',
    endTime: '',
    location: '',
    groupId: '',
  });

  const load = useCallback(async () => {
    try {
      const data = await api.get<Paged<Event>>(`/events?scope=${scope}&limit=50`);
      setEvents(data.items);
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not load events', 'error');
    }
  }, [scope, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api.get<Paged<Group>>('/groups?limit=50').then((d) => setGroups(d.items)).catch(() => {});
  }, []);

  const rsvp = async (id: string, response: 'going' | 'maybe' | 'not_going') => {
    // optimistic
    setEvents((prev) =>
      prev?.map((e) =>
        e.id === id
          ? {
              ...e,
              attendees: {
                ...e.attendees,
                viewerResponse: response,
                going: e.attendees.going + (response === 'going' ? 1 : 0),
              },
            }
          : e,
      ) ?? null,
    );
    try {
      await api.post(`/events/${id}/rsvp`, { response });
      await load();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not RSVP', 'error');
      await load();
    }
  };

  const create = async () => {
    try {
      await api.post('/events', {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime || null,
        location: form.location.trim() || null,
        groupId: form.groupId || null,
      });
      setCreating(false);
      setForm({ title: '', description: '', date: '', startTime: '18:00', endTime: '', location: '', groupId: '' });
      toast('Event created!', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not create event', 'error');
    }
  };

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="row-between mb-3">
        <h1 style={{ fontSize: 24 }}>Events</h1>
        <div className="row">
          <button className={`btn btn-sm ${scope === 'upcoming' ? 'btn-primary' : ''}`} onClick={() => setScope('upcoming')}>Upcoming</button>
          <button className={`btn btn-sm ${scope === 'all' ? 'btn-primary' : ''}`} onClick={() => setScope('all')}>All</button>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>＋ New event</button>
        </div>
      </div>

      {events === null ? (
        <Spinner />
      ) : events.length === 0 ? (
        <EmptyState icon="◷" title={scope === 'upcoming' ? 'No upcoming events' : 'No events at all'} body="Create one and invite your circle." action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Create event</button>} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map((ev) => (
            <article key={ev.id} className="card fade-in">
              <div className="row-between" style={{ flexWrap: 'wrap' }}>
                <div className="row">
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(168,85,247,0.12)',
                      borderRadius: 12,
                      width: 56,
                      height: 56,
                      border: '1px solid rgba(168,85,247,0.3)',
                    }}
                    aria-hidden
                  >
                    <span className="tiny bold" style={{ color: 'var(--purple-soft)' }}>
                      {new Date(`${ev.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}
                    </span>
                    <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{new Date(`${ev.date}T00:00:00`).getDate()}</span>
                  </div>
                  <div>
                    <h2 style={{ fontSize: 17 }}>{ev.title}</h2>
                    <p className="tiny faint">
                      {formatEventDate(ev.date)} · {formatTime(ev.startTime)}
                      {ev.endTime ? ` – ${formatTime(ev.endTime)}` : ''}
                      {ev.location ? ` · 📍 ${ev.location}` : ''}
                    </p>
                  </div>
                </div>
                <div className="row tiny faint">
                  <Avatar name={ev.creator.displayName} size={22} />
                  by {ev.creator.displayName}
                </div>
              </div>

              {ev.description && <p className="small muted mt-2">{ev.description}</p>}

              <div className="row mt-2" style={{ flexWrap: 'wrap', gap: 6 }}>
                <button
                  className={`reaction-chip ${ev.attendees.viewerResponse === 'going' ? 'reacted' : ''}`}
                  onClick={() => void rsvp(ev.id, 'going')}
                  aria-pressed={ev.attendees.viewerResponse === 'going'}
                >
                  ✅ Going · {ev.attendees.going}
                </button>
                <button
                  className={`reaction-chip ${ev.attendees.viewerResponse === 'maybe' ? 'reacted' : ''}`}
                  onClick={() => void rsvp(ev.id, 'maybe')}
                  aria-pressed={ev.attendees.viewerResponse === 'maybe'}
                >
                  🤔 Maybe · {ev.attendees.maybe}
                </button>
                <button
                  className={`reaction-chip ${ev.attendees.viewerResponse === 'not_going' ? 'reacted' : ''}`}
                  onClick={() => void rsvp(ev.id, 'not_going')}
                  aria-pressed={ev.attendees.viewerResponse === 'not_going'}
                >
                  ❌ Can't go · {ev.attendees.notGoing}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {creating && (
        <Modal title="Create event" onClose={() => setCreating(false)}>
          <div className="field">
            <label htmlFor="e-title">Title</label>
            <input id="e-title" className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={120} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="e-desc">Description</label>
            <textarea id="e-desc" className="input" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={2000} />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="e-date">Date</label>
              <input id="e-date" type="date" className="input" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="e-start">Start time</label>
              <input id="e-start" type="time" className="input" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="e-end">End time (optional)</label>
              <input id="e-end" type="time" className="input" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="e-loc">Location (optional)</label>
              <input id="e-loc" className="input" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} maxLength={200} />
            </div>
          </div>
          {groups.length > 0 && (
            <div className="field">
              <label htmlFor="e-group">Group (optional)</label>
              <select id="e-group" className="input" value={form.groupId} onChange={(e) => setForm((f) => ({ ...f, groupId: e.target.value }))}>
                <option value="">No group — just for friends</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={!form.title.trim() || !form.date} onClick={() => void create()}>Create</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function NotificationBadgeLink() {
  return <Link to="/app/notifications">Notifications</Link>;
}
