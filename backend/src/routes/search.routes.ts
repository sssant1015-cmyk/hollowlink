import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateQuery, asyncHandler } from '../middleware/validate.js';
import { searchSchema } from '../schemas/common.js';
import { ok } from './respond.js';
import { likeEscape, parsePagination } from '../lib/pagination.js';
import { getDb } from '../db/connection.js';
import { searchUsers } from '../services/friends.service.js';
import { toPublicGroup } from '../services/groups.service.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  validateQuery(searchSchema),
  asyncHandler(async (req, res) => {
    const q = (req.query as { q: string }).q;
    const page = parsePagination(req.query);
    const db = getDb();
    const viewerId = req.user!.id;
    const pattern = `%${likeEscape(q)}%`;

    const users = searchUsers(viewerId, q, page);

    // Groups: only public groups the user can discover, or groups they belong to.
    const groupRows = db
      .prepare(
        `SELECT g.* FROM groups g
         WHERE (g.is_private = 0 OR g.id IN (SELECT group_id FROM group_members WHERE user_id = @viewer))
         AND (g.name LIKE @pattern ESCAPE '\\' OR g.description LIKE @pattern ESCAPE '\\')
         LIMIT @limit OFFSET @offset`,
      )
      .all({ viewer: viewerId, pattern, limit: page.limit, offset: page.offset }) as Record<string, unknown>[];

    // Posts: only posts the viewer can see (their own, friends', or their groups').
    const postRows = db
      .prepare(
        `SELECT p.id, p.content, p.created_at, u.username, u.display_name FROM posts p
         JOIN users u ON u.id = p.author_id
         WHERE p.content LIKE @pattern ESCAPE '\\'
         AND (
           (p.group_id IS NULL AND (p.author_id = @viewer OR p.author_id IN (SELECT friend_id FROM friendships WHERE user_id = @viewer)))
           OR (p.group_id IS NOT NULL AND p.group_id IN (SELECT group_id FROM group_members WHERE user_id = @viewer))
         )
         ORDER BY p.created_at DESC LIMIT @limit OFFSET @offset`,
      )
      .all({ viewer: viewerId, pattern, limit: page.limit, offset: page.offset }) as Record<string, unknown>[];

    ok(res, {
      users: users.items,
      groups: groupRows.map((row) => toPublicGroup(row as never, viewerId)),
      posts: postRows.map((row) => ({
        id: row.id,
        content: row.content,
        createdAt: row.created_at,
        author: { username: row.username, displayName: row.display_name },
      })),
    });
  }),
);

export default router;
