import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiClientError } from '../api/client';
import type { ExtensionWithState, ExtensionPermission, ExtensionContext } from './types';

interface ExtensionsContextValue {
  extensions: ExtensionWithState[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  enable: (id: string, permissions: ExtensionPermission[]) => Promise<void>;
  disable: (id: string) => Promise<void>;
  saveSettings: (id: string, settings: Record<string, string | number | boolean>) => Promise<void>;
  /** Runtime gate used by the ExtensionContext handed to extension code. */
  buildExtensionContext: (extensionId: string) => ExtensionContext | null;
}

const ExtensionsContext = createContext<ExtensionsContextValue | null>(null);

export function ExtensionsProvider({ children }: { children: ReactNode }) {
  const [extensions, setExtensions] = useState<ExtensionWithState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ extensions: ExtensionWithState[] }>('/extensions');
      setExtensions(data.extensions);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load extensions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async (id: string, permissions: ExtensionPermission[]) => {
    await api.post(`/extensions/${encodeURIComponent(id)}/enable`, { permissions });
    await refresh();
  }, [refresh]);

  const disable = useCallback(async (id: string) => {
    await api.post(`/extensions/${encodeURIComponent(id)}/disable`);
    await refresh();
  }, [refresh]);

  const saveSettings = useCallback(async (id: string, settings: Record<string, string | number | boolean>) => {
    await api.put(`/extensions/${encodeURIComponent(id)}/settings`, { settings });
    await refresh();
  }, [refresh]);

  const buildExtensionContext = useCallback(
    (extensionId: string): ExtensionContext | null => {
      const ext = extensions.find((e) => e.id === extensionId);
      if (!ext || !ext.enabled) return null;
      const granted = new Set<string>(ext.grantedPermissions);
      // Permission must be BOTH granted by the user AND declared by the manifest.
      const declared = new Set<string>(ext.permissions);
      return {
        extensionId,
        settings: ext.settings,
        hasPermission: (permission) => granted.has(permission) && declared.has(permission),
      };
    },
    [extensions],
  );

  const value = useMemo<ExtensionsContextValue>(
    () => ({ extensions, loading, error, refresh, enable, disable, saveSettings, buildExtensionContext }),
    [extensions, loading, error, refresh, enable, disable, saveSettings, buildExtensionContext],
  );

  return <ExtensionsContext.Provider value={value}>{children}</ExtensionsContext.Provider>;
}

export function useExtensions(): ExtensionsContextValue {
  const ctx = useContext(ExtensionsContext);
  if (!ctx) throw new Error('useExtensions must be used inside ExtensionsProvider');
  return ctx;
}
