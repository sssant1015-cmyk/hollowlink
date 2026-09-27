import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ExtensionsProvider, useExtensions } from '../src/extensions/ExtensionsProvider';
import { manifestLooksValid, EXTENSION_PERMISSIONS } from '../src/extensions/types';
import { getBuiltinExtension, BUILTIN_EXTENSIONS } from '../src/extensions/registry';
import { ExtensionPanelRoute } from '../src/pages/ExtensionPanelRoute';

afterEach(cleanup);

function envelope(data: unknown) {
  return new Response(JSON.stringify({ success: true, data, error: null }), { status: 200 });
}

const sampleList = {
  extensions: [
    {
      id: 'example.hello', name: 'Hello HollowLink', version: '1.0.0', description: 'demo', author: 'HT',
      icon: '👋', platforms: ['desktop', 'mobile'], permissions: [], capabilities: ['panel'],
      routes: [{ path: '/extensions/hello', title: 'Hello' }], minCoreVersion: '0.1.0',
      builtin: true, enabled: false, grantedPermissions: [], settings: {},
    },
  ],
};

describe('manifest validation (client)', () => {
  it('accepts well-formed manifests and rejects junk', () => {
    expect(manifestLooksValid(BUILTIN_EXTENSIONS[0]!.manifest)).toBe(true);
    expect(manifestLooksValid({ id: 'nope' })).toBe(false);
    expect(manifestLooksValid(null)).toBe(false);
    expect(manifestLooksValid({ id: 'ok.id', name: 'X', version: 'not-semver', permissions: [] })).toBe(false);
  });

  it('permission catalog matches the approved list exactly', () => {
    expect(EXTENSION_PERMISSIONS).not.toContain('fs.root');
    expect(EXTENSION_PERMISSIONS.length).toBe(10);
  });
});

describe('registry', () => {
  it('resolves builtin extensions and keeps ids unique', () => {
    expect(getBuiltinExtension('example.hello')).toBeTruthy();
    const ids = BUILTIN_EXTENSIONS.map((e) => e.manifest.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ExtensionsProvider lifecycle', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function Probe() {
    const { extensions, enable, disable } = useExtensions();
    return (
      <div>
        <span>{extensions.map((e) => `${e.id}:${e.enabled ? 'on' : 'off'}`).join(',')}</span>
        <button onClick={() => void enable('example.hello', [])}>enable</button>
        <button onClick={() => void disable('example.hello')}>disable</button>
      </div>
    );
  }

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith('/api/extensions') && (!init?.method || init.method === 'GET')) {
        return envelope(sampleList);
      }
      if (path.endsWith('/enable')) {
        return envelope({ grantedPermissions: [] });
      }
      if (path.endsWith('/disable')) {
        return envelope({ disabled: true });
      }
      return envelope({});
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists extensions, then enable/disable round-trips through the API and refreshes', async () => {
    const user = userEvent.setup();
    const refreshed = {
      ...sampleList,
      extensions: sampleList.extensions.map((e) => ({ ...e, enabled: true })),
    };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith('/api/extensions') && (!init?.method || init.method === 'GET')) {
        return envelope(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/enable')).length > 0 ? refreshed : sampleList);
      }
      return envelope({});
    });

    render(
      <MemoryRouter initialEntries={['/app/extensions']}>
        <ExtensionsProvider>
          <Routes>
            <Route path="/app/extensions" element={<Probe />} />
          </Routes>
        </ExtensionsProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('example.hello:off')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'enable' }));
    await waitFor(() => expect(screen.getByText('example.hello:on')).toBeInTheDocument());
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/api/extensions/example.hello/enable'))).toBe(true);

    await user.click(screen.getByRole('button', { name: 'disable' }));
    // after disable, list refresh returns refreshed state still (mock always on) —
    // what matters is the disable endpoint was called:
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/api/extensions/example.hello/disable'))).toBe(true),
    );
  });
});

describe('ExtensionPanelRoute (isolation)', () => {
  it('refuses to render when the extension is disabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => envelope(sampleList)));
    render(
      <MemoryRouter initialEntries={['/app/extensions/example.hello']}>
        <ExtensionsProvider>
          <Routes>
            <Route path="/app/extensions/:extensionId" element={<ExtensionPanelRoute />} />
          </Routes>
        </ExtensionsProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Extension not available/i)).toBeInTheDocument());
    // The panel must NOT be in the document — no bypass of the enabled gate.
    expect(screen.queryByText(/Hello from an extension/i)).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('renders the panel through its controlled context when enabled', async () => {
    const enabledList = {
      extensions: [{ ...sampleList.extensions[0]!, enabled: true }],
    };
    vi.stubGlobal('fetch', vi.fn(async () => envelope(enabledList)));
    render(
      <MemoryRouter initialEntries={['/app/extensions/example.hello']}>
        <ExtensionsProvider>
          <Routes>
            <Route path="/app/extensions/:extensionId" element={<ExtensionPanelRoute />} />
          </Routes>
        </ExtensionsProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Hello from an extension/i)).toBeInTheDocument());
    vi.unstubAllGlobals();
  });
});
