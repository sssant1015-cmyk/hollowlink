import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_APPEARANCE, DEFAULT_ACCESSIBILITY, DEFAULT_LAYOUT,
  type AppearancePrefs, type AccessibilityPrefs, type LayoutPrefs, type ThemePreset,
} from './types';
import { getTheme } from './themes';
import { getFont, ensureFontLoaded } from './fonts';

const LS_APPEARANCE = 'hollowlink.appearance';
const LS_ACCESSIBILITY = 'hollowlink.accessibility';
const LS_LAYOUT = 'hollowlink.layout';
const LS_PRESETS = 'hollowlink.theme-presets';

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const [r, g, b] = [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Perceived-contrast ratio of a hex color against black/white; used for token sanity. */
export function isLightColor(hex: string): boolean {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return false;
  const [r, g, b] = [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)].map((v) => v / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55;
}

function sanitizeHex(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined;
}

/** Increase the alpha of an `rgba(r, g, b, a)` string; passthrough for other formats. */
function bumpRgbaAlpha(color: string, add: number): string {
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (!m) return color;
  const parts = m[1]!.split(',').map((s) => s.trim());
  if (parts.length < 4) return color;
  const alpha = Math.min(1, parseFloat(parts[3]!) + add);
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}

function mergeAppearance(raw: unknown): AppearancePrefs {
  const d = DEFAULT_APPEARANCE;
  if (!raw || typeof raw !== 'object') return { ...d, colors: {} };
  const r = raw as Partial<AppearancePrefs> & { colors?: unknown };
  const validModes = ['dark', 'light', 'system'];
  const validSizes = ['sm', 'md', 'lg', 'xl'];
  const validScales = ['compact', 'comfortable', 'spacious'];
  const validRadius = ['sharp', 'slight', 'rounded', 'very-rounded'];
  const validAnim = ['none', 'reduced', 'normal', 'high'];
  const validEffects = ['off', 'subtle', 'full'];
  return {
    themeMode: validModes.includes(r.themeMode as never) ? r.themeMode! : d.themeMode,
    presetTheme: typeof r.presetTheme === 'string' ? r.presetTheme : d.presetTheme,
    colors: {
      primary: sanitizeHex((r.colors as Record<string, unknown>)?.primary),
      secondary: sanitizeHex((r.colors as Record<string, unknown>)?.secondary),
      bg: sanitizeHex((r.colors as Record<string, unknown>)?.bg),
      surface: sanitizeHex((r.colors as Record<string, unknown>)?.surface),
      text: sanitizeHex((r.colors as Record<string, unknown>)?.text),
      textMuted: sanitizeHex((r.colors as Record<string, unknown>)?.textMuted),
    },
    fontFamily: typeof r.fontFamily === 'string' ? r.fontFamily : d.fontFamily,
    textSize: validSizes.includes(r.textSize as never) ? r.textSize! : d.textSize,
    uiScale: validScales.includes(r.uiScale as never) ? r.uiScale! : d.uiScale,
    radius: validRadius.includes(r.radius as never) ? r.radius! : d.radius,
    animations: validAnim.includes(r.animations as never) ? r.animations! : d.animations,
    glass: validEffects.includes(r.glass as never) ? r.glass! : d.glass,
    glow: validEffects.includes(r.glow as never) ? r.glow! : d.glow,
    gradients: validEffects.includes(r.gradients as never) ? r.gradients! : d.gradients,
    sidebarCollapsed: typeof r.sidebarCollapsed === 'boolean' ? r.sidebarCollapsed : d.sidebarCollapsed,
    compactChat: typeof r.compactChat === 'boolean' ? r.compactChat : d.compactChat,
    feedDensity: r.feedDensity === 'compact' ? 'compact' : 'comfortable',
  };
}

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export interface CustomizationContextValue {
  appearance: AppearancePrefs;
  accessibility: AccessibilityPrefs;
  layout: LayoutPrefs;
  presets: ThemePreset[];
  systemDark: boolean;
  setAppearance: (patch: Partial<AppearancePrefs>) => void;
  setAccessibility: (patch: Partial<AccessibilityPrefs>) => void;
  setLayout: (patch: Partial<LayoutPrefs>) => void;
  savePreset: (name: string) => void;
  renamePreset: (id: string, name: string) => void;
  duplicatePreset: (id: string) => void;
  deletePreset: (id: string) => void;
  applyPreset: (id: string) => void;
  restoreDefaults: () => void;
  contrastWarning: string | null;
}

const CustomizationContext = createContext<CustomizationContextValue | null>(null);

export function CustomizationProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<AppearancePrefs>(() => mergeAppearance(loadLocal(LS_APPEARANCE, DEFAULT_APPEARANCE)));
  const [accessibility, setAccessibilityState] = useState<AccessibilityPrefs>(() => ({ ...DEFAULT_ACCESSIBILITY, ...loadLocal(LS_ACCESSIBILITY, {}) }));
  const [layout, setLayoutState] = useState<LayoutPrefs>(() => ({ ...DEFAULT_LAYOUT, ...loadLocal(LS_LAYOUT, {}) }));
  const [presets, setPresets] = useState<ThemePreset[]>(() => loadLocal(LS_PRESETS, []));
  const [systemDark, setSystemDark] = useState<boolean>(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [contrastWarning, setContrastWarning] = useState<string | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;

  // Track OS scheme for system mode.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const effectiveDark = appearance.themeMode === 'system' ? systemDark : appearance.themeMode === 'dark';

  // ── apply tokens to :root ────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    const theme = getTheme(appearance.presetTheme);
    const c = appearance.colors;
    const dark = effectiveDark;

    // Base: dark mode uses the preset as-is; light mode uses the preset only if it
    // declares itself light (hollow-light), otherwise fall back to hollow-light tokens.
    const lightTheme = theme.id === 'hollow-light' ? theme : getTheme('hollow-light');
    const t = dark ? theme : lightTheme;

    const bg = c.bg ?? (dark ? t.tokens.bg : lightTheme.tokens.bg);
    const bgRaised = dark ? t.tokens.bgRaised : lightTheme.tokens.bgRaised;
    const surface = c.surface ?? (dark ? t.tokens.surface : lightTheme.tokens.surface);
    const text = c.text ?? (dark ? t.tokens.text : lightTheme.tokens.text);
    const textDim = c.textMuted ?? (dark ? t.tokens.textDim : lightTheme.tokens.textDim);
    const primary = c.primary ?? t.tokens.primary;
    const secondary = c.secondary ?? t.tokens.secondary;

    const bgIsLight = isLightColor(bg);
    const textIsLight = isLightColor(text);

    // Accessibility guardrail: text must contrast with background.
    if (c.text && c.bg && textIsLight === bgIsLight) {
      setContrastWarning('Custom text and background are too similar — text may be unreadable.');
    } else {
      setContrastWarning(null);
    }

    const borderColor = c.surface
      ? (bgIsLight ? 'rgba(15,15,30,0.12)' : 'rgba(255,255,255,0.10)')
      : (dark ? t.tokens.border : lightTheme.tokens.border);

    const radiusMap = {
      sharp: { sm: 0, md: 3, lg: 5, xl: 8 },
      slight: { sm: 3, md: 7, lg: 11, xl: 15 },
      rounded: { sm: 8, md: 14, lg: 20, xl: 26 },
      'very-rounded': { sm: 12, md: 20, lg: 28, xl: 36 },
    }[appearance.radius];

    const sizeMap = {
      sm: { xs: 11, sm: 12, md: 14, lg: 16, xl: 20, xl2: 26 },
      md: { xs: 12, sm: 13, md: 15, lg: 17, xl: 22, xl2: 28 },
      lg: { xs: 13, sm: 15, md: 17, lg: 19, xl: 25, xl2: 32 },
      xl: { xs: 14, sm: 16, md: 19, lg: 22, xl: 28, xl2: 36 },
    }[appearance.textSize];

    const scaleMap = {
      compact: { unit: 0.85, gap: 4, padCard: 12, padItem: 8 },
      comfortable: { unit: 1, gap: 6, padCard: 18, padItem: 12 },
      spacious: { unit: 1.2, gap: 8, padCard: 24, padItem: 16 },
    }[appearance.uiScale];

    const animMs = { none: 0, reduced: 120, normal: 200, high: 350 }[appearance.animations];

    root.style.setProperty('--bg', bg);
    root.style.setProperty('--bg-raised', bgRaised);
    root.style.setProperty('--bg-surface', surface);
    root.style.setProperty('--bg-surface-hover', bumpRgbaAlpha(surface, 0.03));
    root.style.setProperty('--border', borderColor);
    root.style.setProperty('--border-strong', bumpRgbaAlpha(borderColor, 0.06));
    root.style.setProperty('--text', text);
    root.style.setProperty('--text-dim', textDim);
    root.style.setProperty('--text-faint', textDim);
    root.style.setProperty('--purple', primary);
    root.style.setProperty('--purple-soft', c.primary ? primary : t.tokens.primarySoft);
    root.style.setProperty('--purple-glow', hexToRgba(primary.startsWith('#') ? primary : '#a855f7', 0.35));
    root.style.setProperty('--cyan', secondary);
    root.style.setProperty('--cyan-soft', c.secondary ? secondary : t.tokens.secondarySoft);
    root.style.setProperty('--shadow', `0 8px 32px rgba(0,0,0,${t.tokens.shadowStrength})`);

    root.style.setProperty('--radius-sm', `${radiusMap.sm}px`);
    root.style.setProperty('--radius', `${radiusMap.md}px`);
    root.style.setProperty('--radius-lg', `${radiusMap.lg}px`);
    root.style.setProperty('--radius-xl', `${radiusMap.xl}px`);

    root.style.setProperty('--font-xs', `${sizeMap.xs}px`);
    root.style.setProperty('--font-sm', `${sizeMap.sm}px`);
    root.style.setProperty('--font-md', `${sizeMap.md}px`);
    root.style.setProperty('--font-lg', `${sizeMap.lg}px`);
    root.style.setProperty('--font-xl', `${sizeMap.xl}px`);
    root.style.setProperty('--font-2xl', `${sizeMap.xl2}px`);

    root.style.setProperty('--scale-unit', String(scaleMap.unit));
    root.style.setProperty('--gap-unit', `${scaleMap.gap}px`);
    root.style.setProperty('--pad-card', `${scaleMap.padCard}px`);
    root.style.setProperty('--pad-item', `${scaleMap.padItem}px`);
    root.style.setProperty('--sidebar-w', appearance.sidebarCollapsed ? '64px' : `${Math.round(232 * scaleMap.unit)}px`);

    root.style.setProperty('--anim-fast', `${Math.round(animMs * 0.6)}ms`);
    root.style.setProperty('--anim', `${animMs}ms`);
    root.style.setProperty('--anim-slow', `${Math.round(animMs * 1.6)}ms`);

    // Effects: drive via data attributes the CSS consumes.
    root.dataset.glass = appearance.glass;
    root.dataset.glow = appearance.glow;
    root.dataset.gradients = appearance.gradients;
    root.dataset.anim = appearance.animations;
    root.dataset.density = appearance.feedDensity;
    root.dataset.chat = appearance.compactChat ? 'compact' : 'comfortable';
    root.dataset.contrast = accessibility.highContrast ? 'high' : 'normal';

    // Font.
    const font = getFont(appearance.fontFamily);
    ensureFontLoaded(appearance.fontFamily);
    root.style.setProperty('--font', font.cssStack);

    // Animations fully off: kill everything globally.
    if (appearance.animations === 'none' || accessibility.reduceMotionOverride === true) {
      root.style.setProperty('--anim-fast', '0ms');
      root.style.setProperty('--anim', '0ms');
      root.style.setProperty('--anim-slow', '0ms');
    }
  }, [appearance, accessibility, effectiveDark]);

  // ── persistence: local immediate, server debounced ──────────────
  useEffect(() => { localStorage.setItem(LS_APPEARANCE, JSON.stringify(appearance)); }, [appearance]);
  useEffect(() => { localStorage.setItem(LS_ACCESSIBILITY, JSON.stringify(accessibility)); }, [accessibility]);
  useEffect(() => { localStorage.setItem(LS_LAYOUT, JSON.stringify(layout)); }, [layout]);
  useEffect(() => { localStorage.setItem(LS_PRESETS, JSON.stringify(presets)); }, [presets]);

  // Debounced server sync (fire-and-forget; offline-first via localStorage).
  // Auth failures are expected when signed out — preferences stay local then.
  useEffect(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      void fetch('/api/preferences', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appearance: appearance,
          accessibility,
          layout,
        }),
      }).catch(() => {});
    }, 1500);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [appearance, accessibility, layout]);

  // One-time hydrate from the server (signed-in users get their saved look back
  // on any device/browser). Local storage remains the source of truth offline.
  useEffect(() => {
    let alive = true;
    void fetch('/api/preferences', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { data?: { preferences?: { appearance?: unknown; accessibility?: unknown; layout?: unknown } } } | null) => {
        if (!alive || !body?.data?.preferences) return;
        const prefs = body.data.preferences;
        setAppearanceState(mergeAppearance({ ...appearanceRef.current, ...(prefs.appearance ?? {}) }));
        setAccessibilityState((prev) => ({ ...prev, ...(typeof prefs.accessibility === 'object' && prefs.accessibility ? prefs.accessibility : {}) }));
        setLayoutState((prev) => ({ ...prev, ...(typeof prefs.layout === 'object' && prefs.layout ? prefs.layout : {}) }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAppearance = useCallback((patch: Partial<AppearancePrefs>) => {
    setAppearanceState((prev) => ({ ...prev, ...patch, colors: patch.colors ? { ...prev.colors, ...patch.colors } : prev.colors }));
  }, []);

  const setAccessibility = useCallback((patch: Partial<AccessibilityPrefs>) => {
    setAccessibilityState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setLayout = useCallback((patch: Partial<LayoutPrefs>) => {
    setLayoutState((prev) => ({ ...prev, ...patch }));
  }, []);

  const savePreset = useCallback((name: string) => {
    setPresets((prev) => [
      ...prev,
      { id: `p_${Date.now()}`, name: name.trim() || 'My theme', appearance: { ...appearance, colors: { ...appearance.colors } }, builtIn: false, createdAt: new Date().toISOString() },
    ]);
  }, [appearance]);

  const renamePreset = useCallback((id: string, name: string) => {
    setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }, []);

  const duplicatePreset = useCallback((id: string) => {
    setPresets((prev) => {
      const src = prev.find((p) => p.id === id);
      if (!src) return prev;
      return [...prev, { ...src, id: `p_${Date.now()}`, name: `${src.name} (copy)`, builtIn: false, createdAt: new Date().toISOString() }];
    });
  }, []);

  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const applyPreset = useCallback((id: string) => {
    const p = presets.find((x) => x.id === id);
    if (p) setAppearanceState({ ...p.appearance, colors: { ...p.appearance.colors } });
  }, [presets]);

  const restoreDefaults = useCallback(() => {
    setAppearanceState({ ...DEFAULT_APPEARANCE, colors: {} });
    setAccessibilityState({ ...DEFAULT_ACCESSIBILITY });
  }, []);

  const value = useMemo<CustomizationContextValue>(
    () => ({
      appearance, accessibility, layout, presets, systemDark,
      setAppearance, setAccessibility, setLayout,
      savePreset, renamePreset, duplicatePreset, deletePreset, applyPreset,
      restoreDefaults, contrastWarning,
    }),
    [appearance, accessibility, layout, presets, systemDark, setAppearance, setAccessibility, setLayout, savePreset, renamePreset, duplicatePreset, deletePreset, applyPreset, restoreDefaults, contrastWarning],
  );

  return <CustomizationContext.Provider value={value}>{children}</CustomizationContext.Provider>;
}

export function useAppearance(): CustomizationContextValue {
  const ctx = useContext(CustomizationContext);
  if (!ctx) throw new Error('useAppearance must be used inside CustomizationProvider');
  return ctx;
}

/** Spec name for the appearance hook — same context, future-proof naming. */
export const useHollowTheme = useAppearance;

/** Spec name for reading the full (validated) preferences record. */
export function useUserPreferences(): { appearance: AppearancePrefs; accessibility: AccessibilityPrefs; layout: LayoutPrefs } {
  const ctx = useAppearance();
  return { appearance: ctx.appearance, accessibility: ctx.accessibility, layout: ctx.layout };
}

export { mergeAppearance };
