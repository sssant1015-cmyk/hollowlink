import type { ExtensionContext } from '../types';

/** Demo extension: zero permissions, pure UI. */
export function HelloPanel({ context }: { context: ExtensionContext }) {
  const greeting = typeof context.settings.greeting === 'string' ? context.settings.greeting : 'Hello from an extension!';
  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 'var(--font-2xl, 28px)' }} className="mb-3">👋 Hello HollowLink</h1>
      <section className="card">
        <p className="mb-2">{greeting}</p>
        <p className="small muted">
          This panel is rendered by the <strong>example.hello</strong> extension. It declared zero permissions,
          so it can read nothing about you — it simply proves the extension lifecycle works:
          manifest → enable → route → controlled context.
        </p>
      </section>
    </div>
  );
}
