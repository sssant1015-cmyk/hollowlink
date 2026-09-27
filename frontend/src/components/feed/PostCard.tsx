import { useState, type ReactNode } from 'react';
import type { Post, Comment } from '../../types/api';
import { api, ApiClientError } from '../../api/client';
import { useAuth } from '../../api/AuthContext';
import { useToast } from '../../utils/toast';
import { Avatar, ConfirmDialog, Spinner } from '../ui/Ui';
import { timeAgo } from '../../utils/format';

const EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀'];

function SimpleModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function PostCard({ post, onChanged }: { post: Post; onChanged: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentText, setCommentText] = useState('');
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.content);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const isMine = user?.id === post.author.id;

  const refresh = async () => {
    onChanged();
  };

  const react = async (emoji: string) => {
    try {
      await api.post('/feed/reactions', { targetType: 'post', targetId: post.id, emoji });
      await refresh();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not react', 'error');
    }
  };

  const loadComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next) {
      try {
        const data = await api.get<{ items: Comment[] }>(`/feed/posts/${post.id}/comments?limit=50`);
        setComments(data.items);
      } catch {
        setComments([]);
      }
    }
  };

  const addComment = async () => {
    const content = commentText.trim();
    if (!content) return;
    try {
      await api.post(`/feed/posts/${post.id}/comments`, { content });
      setCommentText('');
      const data = await api.get<{ items: Comment[] }>(`/feed/posts/${post.id}/comments?limit=50`);
      setComments(data.items);
      await refresh();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not comment', 'error');
    }
  };

  const saveEdit = async () => {
    try {
      await api.patch(`/feed/posts/${post.id}`, { content: editText.trim() });
      setEditing(false);
      await refresh();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not edit', 'error');
    }
  };

  const doDelete = async () => {
    try {
      await api.delete(`/feed/posts/${post.id}`);
      await refresh();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not delete', 'error');
    }
  };

  const report = async (reason: string) => {
    setReporting(false);
    try {
      await api.post('/reports', { targetType: 'post', targetId: post.id, reason });
      toast('Report submitted. Thank you.', 'success');
    } catch {
      toast('Could not submit report', 'error');
    }
  };

  return (
    <article className="card post-card fade-in">
      <header className="row">
        <Avatar name={post.author.displayName} url={post.author.avatarUrl} size={42} />
        <div className="grow">
          <div className="bold small">{post.author.displayName}</div>
          <div className="tiny faint">
            @{post.author.username} · {timeAgo(post.createdAt)}{post.edited ? ' · edited' : ''}
          </div>
        </div>
        {isMine ? (
          <div className="row" style={{ gap: 4 }}>
            <button className="btn btn-ghost btn-sm" aria-label="Edit post" onClick={() => setEditing((v) => !v)}>✎</button>
            <button className="btn btn-ghost btn-sm" aria-label="Delete post" onClick={() => setConfirmDelete(true)}>🗑</button>
          </div>
        ) : (
          <button className="btn btn-ghost btn-sm" aria-label="Report post" onClick={() => setReporting(true)}>⚑</button>
        )}
      </header>

      {editing ? (
        <div className="mt-2">
          <textarea className="input" value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={4000} aria-label="Edit post" />
          <div className="row mt-1" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
          </div>
        </div>
      ) : (
        <p className="post-content">{post.content}</p>
      )}

      {post.media.map((m) => (
        <img key={m.id} src={m.url} alt="Post image" className="post-image" loading="lazy" />
      ))}

      <div className="row mt-2" style={{ flexWrap: 'wrap', gap: 6 }}>
        {post.reactions.map((r) => (
          <button key={r.emoji} className={`reaction-chip ${r.reacted ? 'reacted' : ''}`} onClick={() => react(r.emoji)} aria-label={`${r.emoji} ${r.count}`}>
            {r.emoji} {r.count}
          </button>
        ))}
      </div>

      <div className="row mt-2" style={{ gap: 14 }}>
        <div style={{ position: 'relative' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowEmojiPicker((v) => !v)} aria-expanded={showEmojiPicker} aria-label="Add reaction">
            ＋ react
          </button>
          {showEmojiPicker && (
            <div
              className="card"
              style={{ position: 'absolute', bottom: '110%', left: 0, zIndex: 20, display: 'flex', gap: 2, padding: 6 }}
              role="menu"
            >
              {EMOJI.map((e) => (
                <button
                  key={e}
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '4px 8px' }}
                  onClick={() => {
                    setShowEmojiPicker(false);
                    void react(e);
                  }}
                  aria-label={`React ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadComments} aria-expanded={showComments}>
          💬 {post.commentCount} comment{post.commentCount === 1 ? '' : 's'}
        </button>
      </div>

      {showComments && (
        <div className="mt-2">
          {comments === null ? (
            <Spinner />
          ) : comments.length === 0 ? (
            <p className="tiny faint">No comments yet.</p>
          ) : (
            comments.map((c) => <CommentRow key={c.id} comment={c} onRefresh={loadComments} />)
          )}
          <div className="row mt-1">
            <input
              className="input"
              placeholder="Write a comment…"
              value={commentText}
              maxLength={1000}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addComment();
              }}
              aria-label="Write a comment"
            />
            <button className="btn btn-primary btn-sm" onClick={() => void addComment()}>Send</button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete post?"
          message="This permanently removes the post and its comments."
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            setConfirmDelete(false);
            void doDelete();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      {reporting && (
        <SimpleModal title="Report post" onClose={() => setReporting(false)}>
          {['spam', 'harassment', 'inappropriate', 'misinformation', 'other'].map((r) => (
            <button key={r} className="btn btn-block mb-2" style={{ justifyContent: 'flex-start' }} onClick={() => void report(r)}>
              {r}
            </button>
          ))}
        </SimpleModal>
      )}
    </article>
  );
}

function CommentRow({ comment, onRefresh }: { comment: Comment; onRefresh: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.content);
  const isMine = user?.id === comment.author.id;

  const react = async (emoji: string) => {
    try {
      await api.post('/feed/reactions', { targetType: 'comment', targetId: comment.id, emoji });
      onRefresh();
    } catch {
      toast('Could not react', 'error');
    }
  };

  const del = async () => {
    try {
      await api.delete(`/feed/comments/${comment.id}`);
      onRefresh();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not delete', 'error');
    }
  };

  const save = async () => {
    try {
      await api.patch(`/feed/comments/${comment.id}`, { content: text.trim() });
      setEditing(false);
      onRefresh();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : 'Could not edit', 'error');
    }
  };

  return (
    <div className="comment-row">
      <Avatar name={comment.author.displayName} url={comment.author.avatarUrl} size={30} />
      <div className="grow">
        <div className="small">
          <strong>{comment.author.displayName}</strong>{' '}
          <span className="tiny faint">{timeAgo(comment.createdAt)}{comment.edited ? ' · edited' : ''}</span>
        </div>
        {editing ? (
          <div className="row mt-1">
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label="Edit comment" />
            <button className="btn btn-primary btn-sm" onClick={() => void save()}>Save</button>
          </div>
        ) : (
          <p className="small">{comment.content}</p>
        )}
        <div className="row" style={{ gap: 6, marginTop: 4 }}>
          {comment.reactions.map((r) => (
            <button key={r.emoji} className={`reaction-chip ${r.reacted ? 'reacted' : ''}`} onClick={() => void react(r.emoji)}>
              {r.emoji} {r.count}
            </button>
          ))}
          <button className="reaction-chip" onClick={() => void react('👍')} aria-label="Like comment">👍+</button>
          {isMine && !editing && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>edit</button>
              <button className="btn btn-ghost btn-sm" onClick={() => void del()}>delete</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
