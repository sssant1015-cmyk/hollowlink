/**
 * Extension framework types (frontend mirror of the backend manifest schema).
 * Extensions never import core internals — they receive everything through
 * ExtensionContext, and every capability it exposes is permission-checked
 * against the user's granted permissions before it acts.
 */

export const EXTENSION_PERMISSIONS = [
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

export type ExtensionPermission = (typeof EXTENSION_PERMISSIONS)[number];

export type ExtensionCapability = 'panel' | 'chat-tool' | 'event-attach' | 'dashboard-widget' | 'theme';

export interface ExtensionRouteDef {
  path: string;
  title: string;
}

/** Spec name for a declared extension route. */
export type ExtensionRoute = ExtensionRouteDef;

/** Spec name for the flat settings map an extension may store. */
export type ExtensionSettings = Record<string, string | number | boolean>;

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon: string;
  platforms: ('desktop' | 'mobile')[];
  permissions: ExtensionPermission[];
  capabilities: ExtensionCapability[];
  routes: ExtensionRouteDef[];
  minCoreVersion: string;
}

/** A manifest joined with the current user's install state. */
export interface ExtensionWithState extends ExtensionManifest {
  builtin: boolean;
  enabled: boolean;
  grantedPermissions: ExtensionPermission[];
  settings: Record<string, string | number | boolean>;
}

/** Controlled API handed to extension UI. Nothing else is reachable. */
export interface ExtensionContext {
  extensionId: string;
  settings: Record<string, string | number | boolean>;
  /** True when the signed-in user granted this permission to this extension. */
  hasPermission: (permission: ExtensionPermission) => boolean;
}

export interface HollowLinkExtension {
  manifest: ExtensionManifest;
  /** Lazy React panel component rendered on the extension's routes. */
  component: React.ComponentType<{ context: ExtensionContext }>;
}

export function manifestLooksValid(raw: unknown): raw is ExtensionManifest {
  if (!raw || typeof raw !== 'object') return false;
  const m = raw as Partial<ExtensionManifest>;
  return (
    typeof m.id === 'string' &&
    /^[a-z0-9-]+\.[a-z0-9-]+$/.test(m.id) &&
    typeof m.name === 'string' &&
    typeof m.version === 'string' &&
    /^\d+\.\d+\.\d+$/.test(m.version) &&
    Array.isArray(m.permissions)
  );
}
