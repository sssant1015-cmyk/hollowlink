import type { ExtensionManifest } from '../../services/extensions.service.js';

/** Demo: live theme/palette showcase panel. Requests zero permissions. */
export const themeShowcaseExtension: ExtensionManifest = {
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
};
