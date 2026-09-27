import { useEffect, type ReactNode } from 'react';
import { initials, hueFor } from '../../utils/format';

export function Avatar({
  name,
  url,
  size = 40,
  status,
}: {
  name: string;
  url?: string | null;
  size?: number;
  status?: 'online' | 'away' | 'offline';
}) {
  const inner = url ? (
    <img
      src={url}
      alt={`${name}'s avatar`}
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
    />
  ) : (
    <div
      className="avatar-fallback"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, hsl(${hueFor(name)} 45% 26%), hsl(${hueFor(name)} 45% 16%))`,
      }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
  return (
    <div className="avatar-wrap" style={{ width: size, height: size }}>
      {inner}
      {status && <span className={`presence-dot ${status}`} title={status} />}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="icon" aria-hidden>{icon}</div>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ w = '100%', h = 16, r }: { w?: number | string; h?: number; r?: string }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r }} aria-hidden />;
}

export function PostSkeleton() {
  return (
    <div className="card mb-2" aria-hidden>
      <div className="row">
        <Skeleton w={40} h={40} r="50%" />
        <div className="grow">
          <Skeleton w="30%" h={13} />
          <div className="mt-1" />
          <Skeleton w="20%" h={11} />
        </div>
      </div>
      <div className="mt-2" />
      <Skeleton h={13} />
      <div className="mt-1" />
      <Skeleton w="80%" h={13} />
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" role="progressbar" aria-label="Loading" />;
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="muted">{message}</p>
      <div className="row mt-3" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
