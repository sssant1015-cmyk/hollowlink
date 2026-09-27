export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  customStatus: string | null;
  pronouns: string | null;
}

export interface FullUser extends PublicUser {
  email: string;
  bio: string;
  location: string | null;
  role: 'user' | 'admin';
  privacyProfile: 'public' | 'friends' | 'private';
  privacyPresence: 'public' | 'friends' | 'private';
  emailVerified: boolean;
  createdAt: string;
}

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: 'user' | 'admin';
  avatarUrl: string | null;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  bannerUrl: string | null;
  isPrivate: boolean;
  ownerId: string;
  memberCount: number;
  createdAt: string;
  viewerRole: 'owner' | 'moderator' | 'member' | null;
}

export interface Post {
  id: string;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null };
  groupId: string | null;
  content: string;
  media: { id: string; url: string; mediaType: string }[];
  reactions: { emoji: string; count: number; reacted: boolean }[];
  commentCount: number;
  createdAt: string;
  edited: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null };
  content: string;
  reactions: { emoji: string; count: number; reacted: boolean }[];
  createdAt: string;
  edited: boolean;
}

export interface Conversation {
  id: string;
  kind: 'dm' | 'group';
  title: string | null;
  group: { id: string; name: string; iconUrl: string | null } | null;
  members: { id: string; username: string; displayName: string; avatarUrl: string | null; lastReadAt: string | null }[];
  lastMessage: { id: string; content: string; authorId: string; createdAt: string } | null;
  unreadCount: number;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null };
  content: string;
  replyTo: { id: string; authorName: string; content: string } | null;
  reactions: { emoji: string; count: number; reacted: boolean }[];
  createdAt: string;
  edited: boolean;
  deleted: boolean;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  groupId: string | null;
  creator: { id: string; username: string; displayName: string };
  date: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  attendees: { going: number; maybe: number; notGoing: number; viewerResponse: 'going' | 'maybe' | 'not_going' | null };
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  actor: { id: string; username: string; displayName: string; avatarUrl: string | null } | null;
  read: boolean;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  pinned: boolean;
  author: { id: string; username: string; displayName: string };
  createdAt: string;
}

export interface FriendRequest {
  id: string;
  from?: PublicUser;
  to?: PublicUser;
  message: string | null;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
}
