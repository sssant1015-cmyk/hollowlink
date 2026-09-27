import express from 'express';
import http from 'node:http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import { config } from './config/env.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { initGateway } from './socket/gateway.js';
import { runMigrations } from './db/migrate.js';
import { getDb } from './db/connection.js';

import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import friendsRoutes from './routes/friends.routes.js';
import groupsRoutes from './routes/groups.routes.js';
import feedRoutes from './routes/feed.routes.js';
import chatRoutes from './routes/chat.routes.js';
import eventsRoutes from './routes/events.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import searchRoutes from './routes/search.routes.js';
import moderationRoutes from './routes/moderation.routes.js';
import preferencesRoutes from './routes/preferences.routes.js';
import extensionsRoutes from './routes/extensions.routes.js';
import { registerBuiltinExtensions } from './extensions/builtin.js';

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: config.isProd ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => {
        // No Origin header = same-origin request, curl, or native app → allow.
        if (!origin) return cb(null, true);
        if (config.allowedOrigins.includes(origin)) return cb(null, true);
        cb(null, false); // foreign origin: don't emit CORS headers (browser blocks the read)
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (!config.isTest) app.use(morgan('dev'));

  // Uploaded media (avatars, post images, group icons).
  app.use(
    '/uploads',
    express.static(config.uploadDir, {
      fallthrough: false,
      maxAge: '7d',
    }),
  );

  const api = express.Router();
  api.use(apiLimiter);
  api.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() }, error: null });
  });
  api.use('/auth', authRoutes);
  api.use('/users', profileRoutes);
  api.use('/friends', friendsRoutes);
  api.use('/groups', groupsRoutes);
  api.use('/feed', feedRoutes);
  api.use('/chat', chatRoutes);
  api.use('/events', eventsRoutes);
  api.use('/notifications', notificationsRoutes);
  api.use('/search', searchRoutes);
  api.use('/reports', moderationRoutes);
  api.use('/preferences', preferencesRoutes);
  api.use('/extensions', extensionsRoutes);
  app.use('/api', api);

  app.use(notFoundHandler() as never);
  app.use(errorHandler as never);
  return app;
}

// ── standalone server bootstrap (not run under vitest) ──────────────
const scriptPath = process.argv[1] ? process.argv[1].replace(/\\/g, '/') : '';
const isDirectRun = scriptPath.endsWith('src/index.ts') || scriptPath.endsWith('dist/index.js');
if (process.env.VITEST !== 'true' && isDirectRun) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  runMigrations();
  const db = getDb(); // open early to fail fast
  registerBuiltinExtensions(db); // seed demo extension manifests

  const app = createApp();
  const server = http.createServer(app);
  const io = initGateway(server);

  server.listen(config.port, () => {
    console.log(`\n  HollowLink API listening on http://localhost:${config.port}`);
    console.log(`  Environment: ${config.nodeEnv}`);
    console.log(`  Database:    ${config.databasePath}\n`);
    void io;
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.log('\nShutting down…');
      server.close();
      process.exit(0);
    });
  }
}
