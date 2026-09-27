import type { ExtensionManifest } from '../../services/extensions.service.js';

/** Demo: harmless greeting panel. Requests zero permissions. */
export const helloExtension: ExtensionManifest = {
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
};
