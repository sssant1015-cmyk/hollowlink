import type { HollowLinkExtension } from './types';
import { HelloPanel } from './builtin/HelloPanel';
import { ThemeShowcasePanel } from './builtin/ThemeShowcasePanel';
import { WidgetPanel } from './builtin/WidgetPanel';

/**
 * Client-side extension registry. Manifests here mirror the backend's builtin
 * registrations (source of truth lives server-side; these must keep ids in sync).
 * Panel components are loaded lazily by the ExtensionsPage via route matching.
 */
export const BUILTIN_EXTENSIONS: HollowLinkExtension[] = [
  {
    manifest: {
      id: 'example.hello',
      name: 'Hello HollowLink',
      version: '1.0.0',
      description: 'A tiny demo panel proving the extension framework works end to end.',
      author: 'Hollow Technologies',
      icon: '👋',
      platforms: ['desktop', 'mobile'],
      permissions: [],
      capabilities: ['panel'],
      routes: [{ path: '/extensions/hello', title: 'Hello' }],
      minCoreVersion: '0.1.0',
    },
    component: HelloPanel,
  },
  {
    manifest: {
      id: 'example.theme-showcase',
      name: 'Theme Showcase',
      version: '1.0.0',
      description: 'Displays your current theme tokens — a demo of extensions reading presentation state.',
      author: 'Hollow Technologies',
      icon: '🎨',
      platforms: ['desktop', 'mobile'],
      permissions: [],
      capabilities: ['panel'],
      routes: [{ path: '/extensions/theme-showcase', title: 'Theme Showcase' }],
      minCoreVersion: '0.1.0',
    },
    component: ThemeShowcasePanel,
  },
  {
    manifest: {
      id: 'example.widget',
      name: 'Test Widget',
      version: '1.0.0',
      description: 'Adds a small clock widget slot to the dashboard — demo of the widget capability.',
      author: 'Hollow Technologies',
      icon: '🧩',
      platforms: ['desktop', 'mobile'],
      permissions: [],
      capabilities: ['panel', 'dashboard-widget'],
      routes: [{ path: '/extensions/widget', title: 'Test Widget' }],
      minCoreVersion: '0.1.0',
    },
    component: WidgetPanel,
  },
];

export function getBuiltinExtension(id: string): HollowLinkExtension | undefined {
  return BUILTIN_EXTENSIONS.find((e) => e.manifest.id === id);
}
