import type { DB } from '../connection.js';

/**
 * Migration 0001 — initial HollowLink schema.
 * Normalized, FK-enforced, indexed. All timestamps are ISO-8601 UTC strings.
 */
export function up(db: DB): void {
  db.exec(`
    CREATE TABLE users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      bio           TEXT NOT NULL DEFAULT '',
      avatar_url    TEXT,
      status        TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online','away','offline','invisible')),
      custom_status TEXT,
      pronouns      TEXT,
      location      TEXT,
      role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
      privacy_profile  TEXT NOT NULL DEFAULT 'friends' CHECK (privacy_profile IN ('public','friends','private')),
      privacy_presence TEXT NOT NULL DEFAULT 'friends' CHECK (privacy_presence IN ('public','friends','private')),
      email_verified   INTEGER NOT NULL DEFAULT 0,
      notification_prefs TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE sessions (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      user_agent TEXT,
      ip         TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX idx_sessions_user   ON sessions(user_id);
    CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

    CREATE TABLE password_resets (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at    TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_password_resets_user ON password_resets(user_id);

    CREATE TABLE friendships (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL,
      UNIQUE (user_id, friend_id),
      CHECK (user_id <> friend_id)
    );
    CREATE INDEX idx_friendships_friend ON friendships(friend_id);

    CREATE TABLE friend_requests (
      id         TEXT PRIMARY KEY,
      from_user  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message    TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (from_user, to_user),
      CHECK (from_user <> to_user)
    );
    CREATE INDEX idx_friend_requests_to ON friend_requests(to_user);

    CREATE TABLE blocks (
      id         TEXT PRIMARY KEY,
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE (blocker_id, blocked_id),
      CHECK (blocker_id <> blocked_id)
    );
    CREATE INDEX idx_blocks_blocked ON blocks(blocked_id);

    CREATE TABLE groups (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon_url    TEXT,
      banner_url  TEXT,
      is_private  INTEGER NOT NULL DEFAULT 1,
      invite_code TEXT NOT NULL UNIQUE,
      owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE INDEX idx_groups_owner ON groups(owner_id);

    CREATE TABLE group_members (
      id        TEXT PRIMARY KEY,
      group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','moderator','member')),
      joined_at TEXT NOT NULL,
      UNIQUE (group_id, user_id)
    );
    CREATE INDEX idx_group_members_user ON group_members(user_id);

    CREATE TABLE group_invites (
      id         TEXT PRIMARY KEY,
      group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      code       TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      uses_left  INTEGER,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_group_invites_group ON group_invites(group_id);

    CREATE TABLE posts (
      id         TEXT PRIMARY KEY,
      author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id   TEXT REFERENCES groups(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_posts_created        ON posts(created_at DESC);
    CREATE INDEX idx_posts_author_created ON posts(author_id, created_at DESC);
    CREATE INDEX idx_posts_group_created  ON posts(group_id, created_at DESC);

    CREATE TABLE post_media (
      id         TEXT PRIMARY KEY,
      post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      media_type TEXT NOT NULL DEFAULT 'image',
      url        TEXT NOT NULL,
      position   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_post_media_post ON post_media(post_id);

    CREATE TABLE comments (
      id         TEXT PRIMARY KEY,
      post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_comments_post_created ON comments(post_id, created_at);

    CREATE TABLE reactions (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('post','comment','message')),
      target_id  TEXT NOT NULL,
      emoji      TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, target_type, target_id, emoji)
    );
    CREATE INDEX idx_reactions_target ON reactions(target_type, target_id);

    CREATE TABLE reports (
      id          TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('post','comment','user','group','message')),
      target_id   TEXT NOT NULL,
      reason      TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','resolved','dismissed')),
      created_at  TEXT NOT NULL,
      resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TEXT
    );
    CREATE INDEX idx_reports_status ON reports(status, created_at DESC);

    CREATE TABLE conversations (
      id          TEXT PRIMARY KEY,
      kind        TEXT NOT NULL CHECK (kind IN ('dm','group')),
      group_id    TEXT REFERENCES groups(id) ON DELETE CASCADE,
      title       TEXT,
      created_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL,
      last_message_at TEXT
    );

    CREATE TABLE conversation_members (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read_at    TEXT,
      joined_at       TEXT NOT NULL,
      UNIQUE (conversation_id, user_id)
    );
    CREATE INDEX idx_conversation_members_user ON conversation_members(user_id);

    CREATE TABLE messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      author_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content         TEXT NOT NULL,
      reply_to_id     TEXT REFERENCES messages(id) ON DELETE SET NULL,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      deleted_at      TEXT
    );
    CREATE INDEX idx_messages_conv_created ON messages(conversation_id, created_at);

    CREATE TABLE message_reactions (
      id         TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji      TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (message_id, user_id, emoji)
    );

    CREATE TABLE events (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      group_id    TEXT REFERENCES groups(id) ON DELETE CASCADE,
      creator_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date        TEXT NOT NULL,
      start_time  TEXT NOT NULL,
      end_time    TEXT,
      location    TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE INDEX idx_events_date ON events(date);

    CREATE TABLE event_attendees (
      id         TEXT PRIMARY KEY,
      event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      response   TEXT NOT NULL CHECK (response IN ('going','maybe','not_going')),
      updated_at TEXT NOT NULL,
      UNIQUE (event_id, user_id)
    );

    CREATE TABLE announcements (
      id         TEXT PRIMARY KEY,
      group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      image_url  TEXT,
      pinned     INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_announcements_group ON announcements(group_id, created_at DESC);

    CREATE TABLE notifications (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      actor_id   TEXT REFERENCES users(id) ON DELETE CASCADE,
      entity_type TEXT,
      entity_id  TEXT,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL DEFAULT '',
      read_at    TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
    CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
  `);
}

export function down(db: DB): void {
  db.exec(`
    DROP TABLE IF EXISTS notifications;
    DROP TABLE IF EXISTS announcements;
    DROP TABLE IF EXISTS event_attendees;
    DROP TABLE IF EXISTS events;
    DROP TABLE IF EXISTS message_reactions;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS conversation_members;
    DROP TABLE IF EXISTS conversations;
    DROP TABLE IF EXISTS reports;
    DROP TABLE IF EXISTS reactions;
    DROP TABLE IF EXISTS comments;
    DROP TABLE IF EXISTS post_media;
    DROP TABLE IF EXISTS posts;
    DROP TABLE IF EXISTS group_invites;
    DROP TABLE IF EXISTS group_members;
    DROP TABLE IF EXISTS groups;
    DROP TABLE IF EXISTS blocks;
    DROP TABLE IF EXISTS friend_requests;
    DROP TABLE IF EXISTS friendships;
    DROP TABLE IF EXISTS password_resets;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS users;
  `);
}
