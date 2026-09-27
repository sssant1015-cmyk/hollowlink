import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { uuid } from '../lib/crypto.js';
import { ApiError } from '../lib/apiError.js';

// ── manifest schema ──────────────────────────────────────────────────

export const PERMISSIONS = [
  'profile.read',
  'profile.write',
  'friends.read',
  'groups.read',
  'chat.read',
  'chat.write',
  'notifications.write',
  'events.read',
  'events.write',
  'external_links',
] as const;

export const CAPABILITIES = ['panel', 'chat-tool', 'event-attach', 'dashboard-widget', 'theme'] as const;

export const manifestSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]+\.[a-z0-9-]+$/, 'must be dot-namespaced, e.g. "vendor.name"')
    .max(64),
  name: z.string().min(2).max(48),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver x.y.z'),
  description: z.string().max(300).default(''),
  author: z.string().max(64).default(''),
  icon: z.string().max(16).default('🧩'),
  platforms: z.array(z.enum(['desktop', 'mobile'])).min(1).default(['desktop', 'mobile']),
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).default([]),
  capabilities: z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length).default([]),
  routes: z
    .array(
      z.object({
        path: z.string().regex(/^\/[a-z0-9-_/]*$/).max(64),
        title: z.string().min(1).max(48),
      }),
    )
    .max(8)
    .default([]),
  minCoreVersion: z.string().regex(/^\d+\.\d+\.\d+$/).default('0.1.0'),
});

export type ExtensionManifest = z.infer<typeof manifestSchema>;

/** Core version of this HollowLink build — extensions must declare compatibility. */
export const CORE_VERSION = '0.1.0';

function versionAtLeast(candidate: string, minimum: string): boolean {
  const [c = '0', ,] = candidate.split('.');
  const [m = '0'] = minimum.split('.');
  return Number(c) >= Number(m);
}

export function validateManifest(raw: unknown): ExtensionManifest {
  const manifest = manifestSchema.parse(raw);
  if (!versionAtLeast(CORE_VERSION, manifest.minCoreVersion) && manifest.minCoreVersion > CORE_VERSION) {
    throw new ApiError(400, 'EXTENSION_INCOMPATIBLE', `Extension requires HollowLink ${manifest.minCoreVersion}+ (running ${CORE_VERSION})`);
  }
  return manifest;
}

// ── registry ─────────────────────────────────────────────────────────

export interface RegisteredExtension {
  manifest: ExtensionManifest;
  builtin: boolean;
}

/** Register/refresh a builtin extension (idempotent upsert by id). */
export function registerBuiltinExtension(rawManifest: unknown): ExtensionManifest {
  const manifest = validateManifest(rawManifest);
  const exists = getDb().prepare('SELECT 1 FROM extensions WHERE id = ?').get(manifest.id);
  if (exists) {
    getDb()
      .prepare(
        `UPDATE extensions SET name = ?, version = ?, author = ?, description = ?, manifest_json = ?, builtin = 1 WHERE id = ?`,
      )
      .run(manifest.name, manifest.version, manifest.author, manifest.description, JSON.stringify(manifest), manifest.id);
  } else {
    getDb()
      .prepare(
        `INSERT INTO extensions (id, name, version, author, description, manifest_json, builtin, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(manifest.id, manifest.name, manifest.version, manifest.author, manifest.description, JSON.stringify(manifest), new Date().toISOString());
  }
  return manifest;
}

export function listExtensions(viewerId: string): {
  extensions: (ExtensionManifest & { builtin: boolean; enabled: boolean; grantedPermissions: string[]; settings: Record<string, unknown> })[];
} {
  const rows = getDb().prepare('SELECT * FROM extensions ORDER BY builtin DESC, name').all() as {
    id: string;
    manifest_json: string;
    builtin: number;
  }[];
  const mine = getDb().prepare('SELECT * FROM user_extensions WHERE user_id = ?').all(viewerId) as {
    extension_id: string;
    enabled: number;
    granted_permissions_json: string;
    settings_json: string;
  }[];
  const byId = new Map(mine.map((m) => [m.extension_id, m]));
  return {
    extensions: rows.map((row) => {
      const manifest = JSON.parse(row.manifest_json) as ExtensionManifest;
      const user = byId.get(row.id);
      return {
        ...manifest,
        builtin: Boolean(row.builtin),
        enabled: Boolean(user?.enabled),
        grantedPermissions: user ? (JSON.parse(user.granted_permissions_json) as string[]) : [],
        settings: user ? (JSON.parse(user.settings_json) as Record<string, unknown>) : {},
      };
    }),
  };
}

export function getInstalledExtension(userId: string, extensionId: string) {
  return getDb()
    .prepare('SELECT * FROM user_extensions WHERE user_id = ? AND extension_id = ?')
    .get(userId, extensionId) as
    | { id: string; enabled: number; granted_permissions_json: string; settings_json: string }
    | undefined;
}

function getExtensionOrThrow(extensionId: string): ExtensionManifest {
  const row = getDb().prepare('SELECT manifest_json FROM extensions WHERE id = ?').get(extensionId) as
    | { manifest_json: string }
    | undefined;
  if (!row) throw ApiError.notFound('Extension not found');
  return JSON.parse(row.manifest_json) as ExtensionManifest;
}

export function enableExtension(userId: string, extensionId: string, grantedPermissions?: string[]): { grantedPermissions: string[] } {
  const manifest = getExtensionOrThrow(extensionId);
  // Permission grant is always intersected with what the manifest declares.
  const requested = grantedPermissions ?? [];
  const granted = manifest.permissions.filter((p) => requested.includes(p));
  const existing = getInstalledExtension(userId, extensionId);
  if (existing) {
    getDb().prepare('UPDATE user_extensions SET enabled = 1, granted_permissions_json = ? WHERE id = ?').run(
      JSON.stringify(granted),
      existing.id,
    );
  } else {
    getDb()
      .prepare(
        `INSERT INTO user_extensions (id, user_id, extension_id, enabled, granted_permissions_json, settings_json, installed_at)
         VALUES (?, ?, ?, 1, ?, '{}', ?)`,
      )
      .run(uuid(), userId, extensionId, JSON.stringify(granted), new Date().toISOString());
  }
  return { grantedPermissions: granted };
}

export function disableExtension(userId: string, extensionId: string): void {
  const result = getDb()
    .prepare('UPDATE user_extensions SET enabled = 0 WHERE user_id = ? AND extension_id = ?')
    .run(userId, extensionId);
  if (result.changes === 0) throw ApiError.notFound('Extension not installed');
}

export function setExtensionSettings(userId: string, extensionId: string, settings: unknown): Record<string, unknown> {
  const manifest = getExtensionOrThrow(extensionId);
  const installed = getInstalledExtension(userId, extensionId);
  if (!installed || !installed.enabled) throw ApiError.forbidden('Enable the extension before configuring it');
  // Settings must be a flat string/number/boolean map, max 32 keys — nothing else.
  const parsed = z
    .record(z.union([z.string().max(200), z.number(), z.boolean()]))
    .refine((obj) => Object.keys(obj).length <= 32, 'too many settings keys')
    .parse(settings ?? {});
  getDb().prepare('UPDATE user_extensions SET settings_json = ? WHERE id = ?').run(JSON.stringify(parsed), installed.id);
  void manifest;
  return parsed;
}

/**
 * The only sanctioned way for extension code to act on a user's behalf.
 * Core authorization stays in charge: permission + core ownership checks both apply.
 * Returns void or throws — extension call-sites never touch the DB directly.
 */
export function extensionAuthorized(userId: string, extensionId: string, permission: string): boolean {
  const manifest = getExtensionOrThrow(extensionId);
  if (!manifest.permissions.includes(permission as never)) return false; // manifest never asked for it
  const installed = getInstalledExtension(userId, extensionId);
  if (!installed || !installed.enabled) return false;
  const granted = JSON.parse(installed.granted_permissions_json) as string[];
  return granted.includes(permission);
}
