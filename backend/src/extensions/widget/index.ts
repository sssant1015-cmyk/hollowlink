import type { ExtensionManifest } from '../../services/extensions.service.js';

/** Demo: a dashboard widget extension. Requests zero permissions. */
export const widgetExtension: ExtensionManifest = {
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
};
