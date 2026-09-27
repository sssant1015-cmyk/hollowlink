import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from '../api/AuthContext';
import { useToast } from '../utils/toast';
import { Avatar, EmptyState, Spinner } from '../components/ui/Ui';
import type { Conversation, Message, PublicUser, Paged } from '../types/api';
import { timeAgo } from '../utils/format';

export function ChatPage() {
  return <ChatInner />;
}

function ChatInner() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileOpen = activeId !== null;

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.get<Paged<Conversation>>('/chat?limit=50');
      setConversations(data.items);
      return data.items;
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not load chats', 'error');
      return [];
    }
  }, [toast]);

  useEffect(() => {
    void loadConversations();
    void api.get<Paged<PublicUser>>('/friends?limit=100').then((d) => setFriends(d.items)).catch(() => {});
  }, [loadConversations]);

  const openConversation = useCallback(
    async (conversationId: string) => {
      setActiveId(conversationId);
      setMessages([]);
      setReplyTo(null);
      setLoadingMessages(true);
      try {
        const data = await api.get<{ items: Message[] }>(`/chat/${conversationId}/messages?limit=50`);
        setMessages(data.items);
        const socket = getSocket();
        socket.emit('chat:join', { conversationId });
        socket.emit('chat:read', { conversationId });
        setConversations((prev) =>
          prev?.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)) ?? null,
        );
      } catch (err) {
        toast(err instanceof ApiClientError ? err.message : 'Could not open conversation', 'error');
        setActiveId(null);
      } finally {
        setLoadingMessages(false);
      }
    },
    [toast],
  );

  // socket wiring
  useEffect(() => {
    const socket = getSocket();
    const onMessage = (msg: Message) => {
      if (msg.conversationId === activeId) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        socket.emit('chat:read', { conversationId: activeId });
      }
      void loadConversations();
    };
    const onEdited = (msg: Message) => {
      if (msg.conversationId === activeId) setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
    };
    const onDeleted = (p: { messageId: string; conversationId: string }) => {
      if (p.conversationId === activeId) setMessages((prev) => prev.map((m) => (m.id === p.messageId ? { ...m, deleted: true, content: 'Message deleted' } : m)));
    };
    const onTyping = (p: { conversationId: string; userId: string; typing: boolean }) => {
      if (p.conversationId !== activeId || p.userId === user?.id) return;
      setTypingUsers((prev) => {
        const next = new Set(prev);
        if (p.typing) next.add(p.userId);
        else next.delete(p.userId);
        return next;
      });
    };
    const onReacted = (p: { messageId: string }) => {
      // Re-fetch messages lazily to update reactions
      if (p.messageId && activeId) {
        // light refresh of reactions only
      }
    };
    socket.on('chat:message', onMessage);
    socket.on('chat:edited', onEdited);
    socket.on('chat:deleted', onDeleted);
    socket.on('chat:typing', onTyping);
    socket.on('chat:reacted', onReacted);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:edited', onEdited);
      socket.off('chat:deleted', onDeleted);
      socket.off('chat:typing', onTyping);
      socket.off('chat:reacted', onReacted);
    };
  }, [activeId, user?.id, loadConversations]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, typingUsers.size]);

  const send = () => {
    const content = draft.trim();
    if (!content || !activeId) return;
    const socket = getSocket();
    socket.emit(
      'chat:message',
      { conversationId: activeId, content, replyToId: replyTo?.id ?? null },
      (resp: { ok?: boolean; message?: Message; message2?: never } | { code: string; message: string }) => {
        if ('ok' in resp && resp.ok && resp.message) {
          setMessages((prev) => (prev.some((m) => m.id === resp.message!.id) ? prev : [...prev, resp.message!]));
        } else if ('code' in resp) {
          toast(resp.message, 'error');
        }
      },
    );
    setDraft('');
    setReplyTo(null);
    void loadConversations();
  };

  const onDraftChange = (v: string) => {
    setDraft(v);
    if (!activeId) return;
    const socket = getSocket();
    if (typingTimer.current) clearTimeout(typingTimer.current);
    socket.emit('chat:typing', { conversationId: activeId, typing: true });
    typingTimer.current = setTimeout(() => {
      socket.emit('chat:typing', { conversationId: activeId, typing: false });
    }, 2500);
  };

  const startDm = async (friendId: string) => {
    try {
      const conv = await api.post<Conversation>('/chat/dm', { userId: friendId });
      setShowNewChat(false);
      await loadConversations();
      await openConversation(conv.id);
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not start chat', 'error');
    }
  };

  const reactToMessage = async (messageId: string, emoji: string) => {
    try {
      await apiResponse(messageId, emoji);
    } catch {
      toast('Could not react', 'error');
    }
  };

  const apiResponse = async (messageId: string, emoji: string) => {
    const socket = getSocket();
    socket.emit('chat:react', { messageId, emoji });
  };

  const editMessageLocal = async (m: Message) => {
    const content = window.prompt('Edit message', m.content);
    if (content === null || !content.trim()) return;
    const socket = getSocket();
    socket.emit('chat:edit', { messageId: m.id, content: content.trim() });
  };

  const deleteMessageLocal = (m: Message) => {
    const socket = getSocket();
    socket.emit('chat:delete', { messageId: m.id });
  };

  const titleOf = (c: Conversation): string => {
    if (c.kind === 'group') return c.group?.name ?? 'Group chat';
    const other = c.members.find((m) => m.id !== user?.id);
    return other?.displayName ?? 'Conversation';
  };

  const avatarOf = (c: Conversation) => {
    if (c.kind === 'group') return { name: c.group?.name ?? 'G', url: c.group?.iconUrl };
    const other = c.members.find((m) => m.id !== user?.id);
    return { name: other?.displayName ?? '?', url: other?.avatarUrl };
  };

  const active = conversations?.find((c) => c.id === activeId) ?? null;

  return (
    <div className="chat-layout page-wide" style={{ height: 'calc(100dvh - 61px)' }}>
      <aside className={`chat-list ${mobileOpen ? '' : 'show'}`} aria-label="Conversations">
        <div className="row mb-2">
          <button className="btn btn-primary btn-sm btn-block" onClick={() => setShowNewChat(true)}>＋ New chat</button>
        </div>
        {conversations === null ? (
          <Spinner />
        ) : conversations.length === 0 ? (
          <p className="muted small" style={{ padding: 12 }}>No conversations yet. Start one with a friend.</p>
        ) : (
          conversations.map((c) => {
            const av = avatarOf(c);
            return (
              <button
                key={c.id}
                className={`list-row nav-item ${c.id === activeId ? 'active' : ''}`}
                style={{ width: '100%', border: 'none', background: c.id === activeId ? 'var(--bg-surface-hover)' : undefined }}
                onClick={() => {
                  void openConversation(c.id);
                  navigate(c.kind === 'group' ? `/app/chat/group/${c.group?.id}` : `/app/chat/${c.id}`);
                }}
              >
                <Avatar name={av.name} url={av.url} size={40} />
                <div className="grow" style={{ textAlign: 'left' }}>
                  <div className="small bold truncate">{titleOf(c)}</div>
                  <div className="tiny faint truncate">
                    {c.lastMessage ? c.lastMessage.content.slice(0, 34) : 'No messages yet'}
                  </div>
                </div>
                {c.unreadCount > 0 && <span className="nav-badge">{c.unreadCount}</span>}
              </button>
            );
          })
        )}
      </aside>

      <section className={`chat-conversation ${mobileOpen ? 'show-conversation' : ''}`}>
        {!active ? (
          <EmptyState icon="❍" title="Select a conversation" body="Pick a chat on the left, or start a new one with a friend." />
        ) : (
          <>
            <header className="topbar" style={{ position: 'static' }}>
              <div className="row">
                <button className="btn btn-ghost btn-sm" style={{ display: mobileOpen ? 'inline-flex' : 'none' }} onClick={() => setActiveId(null)} aria-label="Back">
                  ←
                </button>
                <Avatar name={avatarOf(active).name} url={avatarOf(active).url} size={34} />
                <div>
                  <div className="bold small">{titleOf(active)}</div>
                  <div className="tiny faint">
                    {active.kind === 'group' ? `${active.members.length} members` : `@${active.members.find((m) => m.id !== user?.id)?.username ?? ''}`}
                  </div>
                </div>
              </div>
              {active.kind === 'group' && active.group && (
                <Link className="btn btn-ghost btn-sm" to={`/app/groups/${active.group.id}`}>Open group</Link>
              )}
            </header>

            <div className="chat-messages">
              {loadingMessages ? (
                <Spinner />
              ) : messages.length === 0 ? (
                <p className="faint small" style={{ textAlign: 'center', marginTop: 40 }}>No messages yet — say hi 👋</p>
              ) : (
                messages.map((m) => {
                  const mine = m.author.id === user?.id;
                  return (
                    <div key={m.id} className={`chat-bubble-row ${mine ? 'mine' : ''}`}>
                      <div className="chat-bubble">
                        {!mine && active.kind === 'group' && <div className="tiny bold" style={{ color: 'var(--cyan-soft)' }}>{m.author.displayName}</div>}
                        {m.replyTo && (
                          <div className="tiny faint" style={{ borderLeft: '2px solid var(--purple)', paddingLeft: 8, margin: '4px 0' }}>
                            ↩ {m.replyTo.authorName}: {m.replyTo.content}
                          </div>
                        )}
                        <div className="small" style={m.deleted ? { fontStyle: 'italic', opacity: 0.6 } : undefined}>{m.content}</div>
                        <div className="row" style={{ gap: 6, marginTop: 2 }}>
                          <span className="tiny faint">{timeAgo(m.createdAt)}{m.edited ? ' · edited' : ''}</span>
                          {m.reactions.map((r) => (
                            <button key={r.emoji} className={`reaction-chip ${r.reacted ? 'reacted' : ''}`} onClick={() => void reactToMessage(m.id, r.emoji)}>
                              {r.emoji} {r.count}
                            </button>
                          ))}
                        </div>
                        {mine && !m.deleted && (
                          <div className="row" style={{ gap: 4, marginTop: 4 }}>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px' }} onClick={() => void editMessageLocal(m)} aria-label="Edit message">✎</button>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px' }} onClick={() => deleteMessageLocal(m)} aria-label="Delete message">🗑</button>
                          </div>
                        )}
                        {!mine && !m.deleted && (
                          <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px', marginTop: 4 }} onClick={() => setReplyTo(m)} aria-label="Reply">↩</button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              {typingUsers.size > 0 && (
                <div className="tiny faint row" style={{ gap: 8 }}>
                  <span className="typing-dots"><span /><span /><span /></span> someone is typing…
                </div>
              )}
              <div ref={endRef} />
            </div>

            {replyTo && (
              <div className="row-between tiny" style={{ padding: '6px 16px 0', color: 'var(--text-dim)' }}>
                <span>↩ Replying to {replyTo.author.displayName}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setReplyTo(null)}>×</button>
              </div>
            )}

            <div className="chat-input-row">
              <textarea
                className="input"
                rows={1}
                placeholder="Message…"
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                aria-label="Message"
              />
              <button className="btn btn-primary" disabled={!draft.trim()} onClick={send}>Send</button>
            </div>
          </>
        )}
      </section>

      {showNewChat && (
        <div className="modal-overlay" onClick={() => setShowNewChat(false)} role="dialog" aria-modal="true" aria-label="New chat">
          <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
            <h2>Start a chat</h2>
            {friends.length === 0 ? (
              <p className="muted small">Add friends first to start chatting. <Link to="/app/friends">Find friends →</Link></p>
            ) : (
              friends.map((f) => (
                <div key={f.id} className="list-row">
                  <Avatar name={f.displayName} url={f.avatarUrl} size={36} />
                  <div className="grow small bold">{f.displayName}</div>
                  <button className="btn btn-primary btn-sm" onClick={() => void startDm(f.id)}>Chat</button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function GroupChatPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    void (async () => {
      try {
        const conv = await api.get<Conversation>(`/chat/group/${groupId}`);
        setConversationId(conv.id);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Could not open group chat');
      }
    })();
  }, [groupId]);

  useEffect(() => {
    if (conversationId) navigate(`/app/chat/${conversationId}`, { replace: true });
  }, [conversationId, navigate]);

  if (error) {
    return (
      <div className="page">
        <EmptyState icon="🔒" title="Cannot open chat" body={error} action={<Link to="/app/chat" className="btn">Back to chats</Link>} />
      </div>
    );
  }
  return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <Spinner />
    </div>
  );
}
