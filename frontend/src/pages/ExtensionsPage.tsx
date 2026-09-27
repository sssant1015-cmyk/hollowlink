import { useState } from 'react';
import { useExtensions } from '../extensions/ExtensionsProvider';
import { getBuiltinExtension } from '../extensions/registry';
import { EXTENSION_PERMISSIONS, type ExtensionWithState, type ExtensionPermission } from '../extensions/types';
import { useToast } from '../utils/toast';

const PERMISSION_LABELS: Record<ExtensionPermission, string> = {
  'profile.read': 'See your basic profile',
  'profile.write': 'Edit your profile',
  'friends.read': 'See your friends list',
  'groups.read': 'See your groups',
  'chat.read': 'Read messages you can see',
  'chat.write': 'Send messages as you',
  'notifications.write': 'Send you notifications',
  'events.read': 'See your events',
  'events.write': 'Create and change events',
  'external_links': 'Open external links',
};

function PermissionPicker({
  extension,
  selected,
  onToggle,
}: {
  extension: ExtensionWithState;
  selected: Set<string>;
  onToggle: (p: ExtensionPermission) => void;
}) {
  if (extension.permissions.length === 0) {
    return <p className="tiny faint">This extension requests no permissions — it cannot read anything about you.</p>;
  }
  return (
    <div className="mt-2">
      <p className="tiny faint mb-2">Grant permissions (only what you're comfortable with — you can change this later):</p>
      {extension.permissions.map((p) => (
        <label key={p} className="list-row" style={{ padding: '6px 0', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={selected.has(p)}
            onChange={() => onToggle(p)}
            aria-label={PERMISSION_LABELS[p] ?? p}
          />
          <span className="small grow">{PERMISSION_LABELS[p] ?? p}</span>
          <code className="tiny faint">{p}</code>
        </label>
      ))}
    </div>
  );
}

function SettingsEditor({ extension, onSaved }: { extension: ExtensionWithState; onSaved: () => void }) {
  const { saveSettings } = useExtensions();
  const toast = useToast();
  const [settings, setSettings] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(extension.settings).map(([k, v]) => [k, String(v)])),
  );
  const [newKey, setNewKey] = useState('');

  const save = async () => {
    try {
      // Best-effort coercion: numeric strings → numbers, "true"/"false" → booleans.
      const coerced: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(settings)) {
        if (v === 'true') coerced[k] = true;
        else if (v === 'false') coerced[k] = false;
        else if (v !== '' && !Number.isNaN(Number(v))) coerced[k] = Number(v);
        else coerced[k] = v;
      }
      await saveSettings(extension.id, coerced);
      toast('Extension settings saved', 'success');
      onSaved();
    } catch {
      toast('Could not save settings', 'error');
    }
  };

  return (
    <div className="mt-2">
      {Object.keys(settings).length === 0 && <p className="tiny faint">No settings yet. Add simple values (text, number, or true/false).</p>}
      {Object.entries(settings).map(([key, value]) => (
        <div key={key} className="row mb-2" style={{ gap: 8 }}>
          <input
            className="input"
            style={{ maxWidth: 140 }}
            value={key}
            disabled
            aria-label={`Setting key ${key}`}
          />
          <input
            className="input"
            value={value}
            onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
            aria-label={`Setting value for ${key}`}
          />
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <input
          className="input"
          style={{ maxWidth: 140 }}
          placeholder="new key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newKey.trim()) {
              setSettings((s) => (s[newKey.trim()] === undefined ? { ...s, [newKey.trim()]: '' } : s));
              setNewKey('');
            }
          }}
          aria-label="New setting key"
        />
        <button
          className="btn btn-sm"
          onClick={() => {
            if (newKey.trim()) {
              setSettings((s) => (s[newKey.trim()] === undefined ? { ...s, [newKey.trim()]: '' } : s));
              setNewKey('');
            }
          }}
        >
          Add
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => void save()}>Save settings</button>
      </div>
    </div>
  );
}

export function ExtensionsPage() {
  const { extensions, loading, error, enable, disable } = useExtensions();
  const [consenting, setConsenting] = useState<string | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [settingsFor, setSettingsFor] = useState<string | null>(null);

  const startConsent = (ext: ExtensionWithState) => {
    setConsenting(ext.id);
    setSelectedPerms(new Set(ext.grantedPermissions));
  };

  const confirmEnable = async (id: string) => {
    try {
      await enable(id, [...selectedPerms] as ExtensionPermission[]);
    } finally {
      setConsenting(null);
    }
  };

  if (loading) return <div className="page"><p className="muted">Loading extensions…</p></div>;
  if (error) return <div className="page"><p className="form-error">{error}</p></div>;

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 'var(--font-2xl, 28px)' }} className="mb-2">Extensions</h1>
      <p className="muted small mb-3">
        Extensions add features to your HollowLink without touching the core. They run sandboxed: they can only do
        what their manifest declares <em>and</em> you explicitly allow.
      </p>

      {extensions.map((ext) => {
        const builtin = getBuiltinExtension(ext.id);
        const isConsenting = consenting === ext.id;
        return (
          <section key={ext.id} className="card mb-3" aria-label={`Extension ${ext.name}`}>
            <div className="row-between">
              <div className="row grow">
                <span aria-hidden style={{ fontSize: 26 }}>{ext.icon}</span>
                <div>
                  <div className="small bold">{ext.name} <span className="tiny faint">v{ext.version}</span></div>
                  <div className="tiny faint">{ext.author}</div>
                </div>
              </div>
              {ext.enabled ? (
                <div className="row" style={{ gap: 6 }}>
                  <span className="badge badge-green">enabled</span>
                  <button className="btn btn-sm" onClick={() => setSettingsFor(settingsFor === ext.id ? null : ext.id)}>
                    Settings
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => void disable(ext.id)}>Disable</button>
                </div>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => startConsent(ext)}>Enable</button>
              )}
            </div>

            <p className="small muted mt-2 mb-2">{ext.description}</p>

            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <span className="badge badge-gray">{ext.platforms.join(' + ')}</span>
              {ext.capabilities.map((c) => (
                <span key={c} className="badge badge-cyan">{c}</span>
              ))}
              {ext.permissions.length > 0 && (
                <span className="badge badge-yellow">
                  {ext.grantedPermissions.length}/{ext.permissions.length} permissions
                </span>
              )}
            </div>

            {isConsenting && (
              <div className="mt-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <PermissionPicker extension={ext} selected={selectedPerms} onToggle={(p) => setSelectedPerms((s) => {
                  const next = new Set(s);
                  if (next.has(p)) next.delete(p); else next.add(p);
                  return next;
                })} />
                <div className="row mt-2" style={{ justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConsenting(null)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={() => void confirmEnable(ext.id)}>Enable with these permissions</button>
                </div>
              </div>
            )}

            {settingsFor === ext.id && ext.enabled && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <SettingsEditor extension={ext} onSaved={() => setSettingsFor(null)} />
              </div>
            )}

            {builtin?.manifest.routes.map((r) => (
              <a key={r.path} href={`#/app${r.path}`} className="tiny" style={{ display: 'inline-block', marginTop: 8 }}>
                Open {r.title} →
              </a>
            ))}
          </section>
        );
      })}

      <p className="tiny faint">
        Available permissions: {EXTENSION_PERMISSIONS.length} · Future extensions (video meetings, games, music) will
        appear here through the same framework.
      </p>
    </div>
  );
}
