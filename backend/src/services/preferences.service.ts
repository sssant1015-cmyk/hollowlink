import { z } from 'zod';
import { getDb } from '../db/connection.js';

// ── schemas (never trust raw client JSON) ────────────────────────────

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const appearanceSchema = z.object({
  themeMode: z.enum(['dark', 'light', 'system']).default('dark'),
  presetTheme: z
    .enum(['hollow-dark', 'hollow-light', 'midnight', 'purple-void', 'cyber', 'ember', 'ocean', 'forest'])
    .default('hollow-dark'),
  colors: z
    .object({
      primary: hexColor.optional(),
      secondary: hexColor.optional(),
      bg: hexColor.optional(),
      surface: hexColor.optional(),
      text: hexColor.optional(),
      textMuted: hexColor.optional(),
    })
    .default({}),
  fontFamily: z.enum(['system', 'inter', 'manrope', 'space-grotesk', 'orbitron', 'rajdhani', 'serif']).default('inter'),
  textSize: z.enum(['sm', 'md', 'lg', 'xl']).default('md'),
  uiScale: z.enum(['compact', 'comfortable', 'spacious']).default('comfortable'),
  radius: z.enum(['sharp', 'slight', 'rounded', 'very-rounded']).default('rounded'),
  animations: z.enum(['none', 'reduced', 'normal', 'high']).default('normal'),
  glass: z.enum(['off', 'subtle', 'full']).default('full'),
  glow: z.enum(['off', 'subtle', 'full']).default('full'),
  gradients: z.enum(['off', 'subtle', 'full']).default('full'),
  sidebarCollapsed: z.boolean().default(false),
  compactChat: z.boolean().default(false),
  feedDensity: z.enum(['comfortable', 'compact']).default('comfortable'),
});

export const accessibilitySchema = z.object({
  highContrast: z.boolean().default(false),
  reduceMotionOverride: z.boolean().nullable().default(null),
  focusIndicators: z.boolean().default(true),
});

export const layoutSchema = z.object({
  dashboardWidgets: z
    .array(z.object({ id: z.string().min(1).max(64), visible: z.boolean() }))
    .max(24)
    .default([]),
});

const preferencesSchema = z.object({
  appearance: appearanceSchema.default({}),
  accessibility: accessibilitySchema.default({}),
  layout: layoutSchema.default({}),
});

export type PreferencesPayload = z.infer<typeof preferencesSchema>;

const DEFAULTS = preferencesSchema.parse({});

// ── service ──────────────────────────────────────────────────────────

function readRow(userId: string): PreferencesPayload | null {
  const row = getDb()
    .prepare('SELECT appearance_json, accessibility_json, layout_json FROM user_preferences WHERE user_id = ?')
    .get(userId) as { appearance_json: string; accessibility_json: string; layout_json: string } | undefined;
  if (!row) return null;
  let stored: { appearance?: Record<string, unknown>; accessibility?: Record<string, unknown>; layout?: Record<string, unknown> };
  try {
    stored = {
      appearance: JSON.parse(row.appearance_json),
      accessibility: JSON.parse(row.accessibility_json),
      layout: JSON.parse(row.layout_json),
    };
  } catch {
    // Corrupt rows fall back to defaults rather than breaking the user.
    return { ...DEFAULTS };
  }
  // Merge stored over defaults so newly added keys always exist and partial saves keep prior values.
  return preferencesSchema.parse({
    appearance: { ...DEFAULTS.appearance, ...(stored.appearance ?? {}) },
    accessibility: { ...DEFAULTS.accessibility, ...(stored.accessibility ?? {}) },
    layout: { ...DEFAULTS.layout, ...(stored.layout ?? {}) },
  });
}

export function getPreferences(userId: string): PreferencesPayload {
  return readRow(userId) ?? { ...DEFAULTS };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function savePreferences(userId: string, payload: unknown): PreferencesPayload {
  const body = isPlainObject(payload) ? payload : {};
  // Merge the raw partials over the stored values FIRST, then validate once.
  // (Validating first would refill omitted fields with schema defaults and clobber them.)
  const current = readRow(userId);
  const merged = preferencesSchema.parse({
    appearance: { ...(current?.appearance ?? {}), ...(isPlainObject(body.appearance) ? body.appearance : {}) },
    accessibility: { ...(current?.accessibility ?? {}), ...(isPlainObject(body.accessibility) ? body.accessibility : {}) },
    layout: { ...(current?.layout ?? {}), ...(isPlainObject(body.layout) ? body.layout : {}) },
  });
  const now = new Date().toISOString();
  const exists = getDb().prepare('SELECT 1 FROM user_preferences WHERE user_id = ?').get(userId);
  if (exists) {
    getDb()
      .prepare(
        `UPDATE user_preferences SET appearance_json = ?, accessibility_json = ?, layout_json = ?, updated_at = ?
         WHERE user_id = ?`,
      )
      .run(JSON.stringify(merged.appearance), JSON.stringify(merged.accessibility), JSON.stringify(merged.layout), now, userId);
  } else {
    getDb()
      .prepare(
        `INSERT INTO user_preferences (id, user_id, appearance_json, accessibility_json, layout_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        userId,
        JSON.stringify(merged.appearance),
        JSON.stringify(merged.accessibility),
        JSON.stringify(merged.layout),
        now,
      );
  }
  return merged;
}

export function deletePreferences(userId: string): void {
  getDb().prepare('DELETE FROM user_preferences WHERE user_id = ?').run(userId);
}
