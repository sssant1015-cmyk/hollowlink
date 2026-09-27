import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { ApiError } from '../lib/apiError.js';
import { config } from '../config/env.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const SIGS: { magic: number[]; ext: string; mime: string }[] = [
  { magic: [0xff, 0xd8, 0xff], ext: 'jpg', mime: 'image/jpeg' },
  { magic: [0x89, 0x50, 0x4e, 0x47], ext: 'png', mime: 'image/png' },
  { magic: [0x47, 0x49, 0x46, 0x38], ext: 'gif', mime: 'image/gif' },
  { magic: [0x52, 0x49, 0x46, 0x46], ext: 'webp', mime: 'image/webp' },
];

/** Detect the real file type from magic bytes — never trust the client-provided MIME type. */
export function sniffImage(buf: Buffer): { ext: string; mime: string } | null {
  if (!buf || buf.length < 12) return null;
  for (const sig of SIGS) {
    const magicOk = sig.magic.every((byte, i) => buf[i] === byte);
    if (!magicOk) continue;
    if (sig.ext === 'webp') {
      return buf.toString('ascii', 8, 12) === 'WEBP' ? { ext: 'webp', mime: 'image/webp' } : null;
    }
    return { ext: sig.ext, mime: sig.mime };
  }
  return null;
}

/** Memory storage so we can sniff bytes, then write with a generated safe filename. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const okExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(path.extname(file.originalname).toLowerCase());
    if (!okExt) return cb(ApiError.unsupportedMedia('Only jpg, png, gif, webp images are allowed'));
    cb(null, true);
  },
});

export interface UploadKind {
  kind: 'avatars' | 'posts' | 'groups' | 'announcements';
  maxBytes?: number;
}

export function imageUpload(options: UploadKind) {
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;
  return {
    /** multer middleware for a single file field */
    single: (fieldName: string) => upload.single(fieldName),
    /** Validate + persist an uploaded image; returns the public URL. */
    save: (file: Express.Multer.File | undefined): { url: string } => {
      if (!file) throw ApiError.badRequest('No file uploaded');
      if (file.size > maxBytes) throw ApiError.payloadTooLarge(`File exceeds ${Math.round(maxBytes / 1024 / 1024)} MB limit`);
      const sniffed = sniffImage(file.buffer);
      if (!sniffed) throw ApiError.unsupportedMedia('File is not a recognized image');
      const dir = path.join(config.uploadDir, options.kind);
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${sniffed.ext}`;
      fs.writeFileSync(path.join(dir, filename), file.buffer);
      return { url: `/uploads/${options.kind}/${filename}` };
    },
    maxBytes,
  };
}
