import { useState } from 'react';
import { useAppearance } from '../customization/CustomizationProvider';
import { PRESET_THEMES } from '../customization/themes';
import { FONT_CATALOG } from '../customization/fonts';
import type { TextSize, UiScale, RadiusScale, AnimationLevel, EffectLevel } from '../customization/types';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card mb-3">
      <h2 className="card-title">{title}</h2>
      {children}
    </section>
  );
}

function ChoiceRow<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => (
        <button
          key={o.value}
          className={`btn btn-sm ${value === o.value ? 'btn-primary' : ''}`}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string | undefined; onChange: (hex: string | undefined) => void }) {
  return (
    <div className="field">
      <label>{label} {value && <button className="btn btn-ghost btn-sm" onClick={() => onChange(undefined)}>reset</button>}</label>
      <input
        type="color"
        value={value ?? '#000000'}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 48, height: 34, padding: 2, cursor: 'pointer' }}
        aria-label={label}
      />
    </div>
  );
}

export function AppearancePage() {
  const {
    appearance, setAppearance, presets,
    savePreset, renamePreset, duplicatePreset, deletePreset, applyPreset,
    restoreDefaults, contrastWarning,
  } = useAppearance();
  const [presetName, setPresetName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 'var(--hl-font-2xl)' }} className="mb-3">Appearance</h1>
      {contrastWarning && (
        <p className="badge badge-yellow mb-3" role="alert" style={{ padding: '8px 12px' }}>⚠ {contrastWarning}</p>
      )}

      {/* ── Live preview ─────────────────────────────────── */}
      <Section title="Live preview">
        <div
          style={{
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--hl-radius-lg)',
            padding: 'var(--hl-pad-card)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-unit)',
          }}
        >
          <div style={{ fontFamily: 'var(--hl-font-family)' }}>
            <span style={{ fontSize: 'var(--hl-font-xl)', fontWeight: 800, color: 'var(--text)' }}>Aa </span>
            <span style={{ fontSize: 'var(--hl-font-md)', color: 'var(--text-dim)' }}>The quick brown fox · 123</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary btn-sm">Primary</button>
            <button className="btn btn-sm">Secondary</button>
            <span className="badge">Badge</span>
            <span className="avatar" style={{ width: 30, height: 30, fontSize: 13 }}>A</span>
          </div>
          <div className="chat-bubble-row mine"><div className="chat-bubble"><span className="small">Looks like this in chat 💬</span></div></div>
        </div>
      </Section>

      {/* ── Theme mode + presets ─────────────────────────── */}
      <Section title="Theme">
        <ChoiceRow
          options={[
            { value: 'dark' as const, label: '🌙 Dark' },
            { value: 'light' as const, label: '☀️ Light' },
            { value: 'system' as const, label: '🖥 System' },
          ]}
          value={appearance.themeMode}
          onChange={(v) => setAppearance({ themeMode: v })}
        />
        <div className="grid mt-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {PRESET_THEMES.map((t) => (
            <button
              key={t.id}
              className={`card ${appearance.presetTheme === t.id && Object.keys(appearance.colors).length === 0 ? '' : ''}`}
              style={{
                cursor: 'pointer', textAlign: 'left',
                outline: appearance.presetTheme === t.id && Object.keys(appearance.colors).length === 0 ? '2px solid var(--purple)' : 'none',
                background: t.tokens.bg, color: t.tokens.text, borderColor: t.tokens.border,
              }}
              onClick={() => setAppearance({ presetTheme: t.id as import('../customization/types').PresetThemeId, colors: {} })}
              aria-pressed={appearance.presetTheme === t.id}
            >
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <span style={{ width: 18, height: 18, borderRadius: 6, background: t.tokens.primary }} />
                <span style={{ width: 18, height: 18, borderRadius: 6, background: t.tokens.secondary }} />
                <span style={{ width: 18, height: 18, borderRadius: 6, background: t.tokens.bgRaised, border: '1px solid rgba(128,128,128,0.4)' }} />
              </div>
              <span style={{ fontSize: 'var(--hl-font-sm)', fontWeight: 700 }}>{t.name}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* ── Custom colors ────────────────────────────────── */}
      <Section title="Custom colors (override the preset)">
        <div className="grid grid-3">
          <ColorField label="Primary accent" value={appearance.colors.primary} onChange={(v) => setAppearance({ colors: { primary: v } })} />
          <ColorField label="Secondary accent" value={appearance.colors.secondary} onChange={(v) => setAppearance({ colors: { secondary: v } })} />
          <ColorField label="Background" value={appearance.colors.bg} onChange={(v) => setAppearance({ colors: { bg: v } })} />
          <ColorField label="Surface" value={appearance.colors.surface} onChange={(v) => setAppearance({ colors: { surface: v } })} />
          <ColorField label="Text" value={appearance.colors.text} onChange={(v) => setAppearance({ colors: { text: v } })} />
          <ColorField label="Muted text" value={appearance.colors.textMuted} onChange={(v) => setAppearance({ colors: { textMuted: v } })} />
        </div>
      </Section>

      {/* ── Fonts ────────────────────────────────────────── */}
      <Section title="Font">
        <ChoiceRow
          options={FONT_CATALOG.map((f) => ({ value: f.id, label: f.name }))}
          value={appearance.fontFamily}
          onChange={(v) => setAppearance({ fontFamily: v })}
        />
      </Section>

      {/* ── Text size ────────────────────────────────────── */}
      <Section title="Text size">
        <ChoiceRow
          options={[
            { value: 'sm' as TextSize, label: 'Small' },
            { value: 'md' as TextSize, label: 'Default' },
            { value: 'lg' as TextSize, label: 'Large' },
            { value: 'xl' as TextSize, label: 'Extra large' },
          ]}
          value={appearance.textSize}
          onChange={(v) => setAppearance({ textSize: v })}
        />
      </Section>

      {/* ── Interface scale ──────────────────────────────── */}
      <Section title="Interface scale">
        <ChoiceRow
          options={[
            { value: 'compact' as UiScale, label: 'Compact' },
            { value: 'comfortable' as UiScale, label: 'Comfortable' },
            { value: 'spacious' as UiScale, label: 'Spacious' },
          ]}
          value={appearance.uiScale}
          onChange={(v) => setAppearance({ uiScale: v })}
        />
      </Section>

      {/* ── Corner radius ────────────────────────────────── */}
      <Section title="Corner radius">
        <ChoiceRow
          options={[
            { value: 'sharp' as RadiusScale, label: 'Sharp' },
            { value: 'slight' as RadiusScale, label: 'Slight' },
            { value: 'rounded' as RadiusScale, label: 'Rounded' },
            { value: 'very-rounded' as RadiusScale, label: 'Very rounded' },
          ]}
          value={appearance.radius}
          onChange={(v) => setAppearance({ radius: v })}
        />
      </Section>

      {/* ── Animation ────────────────────────────────────── */}
      <Section title="Animations">
        <ChoiceRow
          options={[
            { value: 'none' as AnimationLevel, label: 'None' },
            { value: 'reduced' as AnimationLevel, label: 'Reduced' },
            { value: 'normal' as AnimationLevel, label: 'Normal' },
            { value: 'high' as AnimationLevel, label: 'High' },
          ]}
          value={appearance.animations}
          onChange={(v) => setAppearance({ animations: v })}
        />
        <p className="form-hint mt-1">Your system's reduce-motion setting is always respected.</p>
      </Section>

      {/* ── Effects ──────────────────────────────────────── */}
      <Section title="Visual effects">
        {([
          ['Glass blur', 'glass'],
          ['Glow', 'glow'],
          ['Background gradients', 'gradients'],
        ] as [string, 'glass' | 'glow' | 'gradients'][]).map(([label, key]) => (
          <div key={key} className="row-between mb-2">
            <span className="small">{label}</span>
            <ChoiceRow
              options={[
                { value: 'off' as EffectLevel, label: 'Off' },
                { value: 'subtle' as EffectLevel, label: 'Subtle' },
                { value: 'full' as EffectLevel, label: 'Full' },
              ]}
              value={appearance[key]}
              onChange={(v) => setAppearance({ [key]: v } as never)}
            />
          </div>
        ))}
      </Section>

      {/* ── Layout ───────────────────────────────────────── */}
      <Section title="Layout">
        <div className="row-between mb-2">
          <span className="small">Compact chat messages</span>
          <button className={`btn btn-sm ${appearance.compactChat ? 'btn-primary' : ''}`} onClick={() => setAppearance({ compactChat: !appearance.compactChat })} aria-pressed={appearance.compactChat}>
            {appearance.compactChat ? 'On' : 'Off'}
          </button>
        </div>
        <div className="row-between mb-2">
          <span className="small">Compact feed</span>
          <button className={`btn btn-sm ${appearance.feedDensity === 'compact' ? 'btn-primary' : ''}`} onClick={() => setAppearance({ feedDensity: appearance.feedDensity === 'compact' ? 'comfortable' : 'compact' })} aria-pressed={appearance.feedDensity === 'compact'}>
            {appearance.feedDensity === 'compact' ? 'Compact' : 'Comfortable'}
          </button>
        </div>
        <div className="row-between">
          <span className="small">Collapsed sidebar (desktop)</span>
          <button className={`btn btn-sm ${appearance.sidebarCollapsed ? 'btn-primary' : ''}`} onClick={() => setAppearance({ sidebarCollapsed: !appearance.sidebarCollapsed })} aria-pressed={appearance.sidebarCollapsed}>
            {appearance.sidebarCollapsed ? 'Collapsed' : 'Expanded'}
          </button>
        </div>
      </Section>

      {/* ── Presets ──────────────────────────────────────── */}
      <Section title="My presets">
        <div className="row mb-2">
          <input
            className="input"
            placeholder="Name your current look…"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            maxLength={32}
            aria-label="Preset name"
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={!presetName.trim()}
            onClick={() => { savePreset(presetName); setPresetName(''); }}
          >
            Save current
          </button>
        </div>
        {presets.length === 0 ? (
          <p className="faint small">No saved presets yet — tweak your look above, then save it here.</p>
        ) : (
          presets.map((p) => (
            <div key={p.id} className="list-row">
              {renaming === p.id ? (
                <>
                  <input className="input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus aria-label="New preset name" />
                  <button className="btn btn-primary btn-sm" onClick={() => { renamePreset(p.id, renameValue.trim() || p.name); setRenaming(null); }}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setRenaming(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <span className="small bold grow truncate">{p.name}</span>
                  <button className="btn btn-sm" onClick={() => applyPreset(p.id)}>Apply</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => duplicatePreset(p.id)}>Copy</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setRenaming(p.id); setRenameValue(p.name); }}>Rename</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => deletePreset(p.id)} aria-label={`Delete ${p.name}`}>🗑</button>
                </>
              )}
            </div>
          ))
        )}
      </Section>

      <div className="row mb-3" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-danger" onClick={restoreDefaults}>Restore defaults</button>
      </div>
    </div>
  );
}
