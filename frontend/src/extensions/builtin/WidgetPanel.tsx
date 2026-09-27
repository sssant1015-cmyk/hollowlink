import { useEffect, useState } from 'react';
import type { ExtensionContext } from '../types';

/** Demo extension: widget capability. Settings are flat primitives from the manager. */
export function WidgetPanel({ context }: { context: ExtensionContext }) {
  const [now, setNow] = useState(() => new Date());
  const showSeconds = context.settings.showSeconds === true;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 'var(--font-2xl, 28px)' }} className="mb-3">🧩 Test Widget</h1>
      <section className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 'var(--font-2xl, 28px)', fontWeight: 800, letterSpacing: '0.02em' }}>
          {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: showSeconds ? '2-digit' : undefined })}
        </div>
        <p className="small muted mt-2">
          {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <p className="tiny faint mt-2">
          Widget capability demo — future dashboard extensions (games, music, meetings) render through this same slot.
        </p>
      </section>
    </div>
  );
}
