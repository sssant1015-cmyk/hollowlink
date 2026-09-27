import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/src/config -> backend root is two levels up
export const backendRoot = path.resolve(__dirname, '..', '..');

const schema = z.object({
  // Some shells export a useless global PORT=0; treat that as unset.
  PORT: z.preprocess((v) => (v === '0' || v === '' ? undefined : v), z.coerce.number().int().min(1).max(65535).default(8787)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_PATH: z.string().default('../database/hollowlink.db'),
  UPLOAD_DIR: z.string().default('../uploads'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters — generate one with crypto.randomBytes(48).toString("hex")')
    .default('dev-only-insecure-secret-change-me-0123456789abcdef0123456789abcdef'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  APP_URL: z.string().default('http://localhost:5173'),
  PASSWORD_RESET_TTL: z.string().default('1h'),
  // When set, registration requires this exact code (invite-only signups).
  // Empty/undefined = open registration.
  REGISTRATION_INVITE_CODE: z.string().min(6).max(128).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with a readable message — never start with a broken config.
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const raw = parsed.data;

function resolveFromBackendRoot(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(backendRoot, p);
}

export const config = {
  port: raw.PORT,
  nodeEnv: raw.NODE_ENV,
  isProd: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test' || process.env.VITEST === 'true',
  allowedOrigins: raw.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
  databasePath: resolveFromBackendRoot(raw.DATABASE_PATH),
  uploadDir: resolveFromBackendRoot(raw.UPLOAD_DIR),
  jwtSecret: raw.JWT_SECRET,
  jwtExpiresIn: raw.JWT_EXPIRES_IN,
  appUrl: raw.APP_URL,
  passwordResetTtlMs: parseTtlMs(raw.PASSWORD_RESET_TTL),
  registrationInviteCode: raw.REGISTRATION_INVITE_CODE,
  cookieName: 'hollowlink_token',
} as const;

function parseTtlMs(input: string): number {
  const m = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(input.trim());
  if (!m) return 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = m[2] ?? 's';
  const mult = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return n * mult;
}

export type AppConfig = typeof config;
