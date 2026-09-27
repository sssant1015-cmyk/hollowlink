import type { DB } from '../db/connection.js';
import { registerBuiltinExtension } from '../services/extensions.service.js';
import { helloExtension } from './hello/index.js';
import { themeShowcaseExtension } from './theme-showcase/index.js';
import { widgetExtension } from './widget/index.js';

/**
 * Builtin demo extensions. These are the "Available" catalog for now —
 * harmless internal extensions that prove the framework end-to-end.
 * Future third-party extensions (Zoom, games, music…) plug in the same way
 * via registerBuiltinExtension or a future loader.
 */
const BUILTINS = [helloExtension, themeShowcaseExtension, widgetExtension];

export function registerBuiltinExtensions(db: DB): void {
  void db;
  for (const manifest of BUILTINS) registerBuiltinExtension(manifest);
}
