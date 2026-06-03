// Use drizzle-orm/libsql/http + @libsql/client/http for Vercel serverless.
// Pure HTTP transport (no WebSockets, no native binaries) — most reliable
// option for serverless functions where WebSocket connections may be restricted.
import { drizzle } from "drizzle-orm/libsql/http";
import { createClient } from "@libsql/client/http";
import { eq, or, and, desc, ne, inArray, gt, sql } from "drizzle-orm";
import {
  users, posts, comments, likes, friendships, notifications, sessions, securityEvents, passwordResetTokens,
  conversations, directMessages, userPublicKeys, userPresence,
  stories, storyViews, Story, InsertStory, StoryView,
  type User, type InsertUser,
  type Post, type InsertPost,
  type Comment, type InsertComment,
  type Like, type InsertLike,
  type Friendship, type InsertFriendship,
  type Notification, type InsertNotification,
  type Session, type InsertSession,
  type SecurityEvent, type InsertSecurityEvent,
  type PasswordResetToken,
  type Conversation, type InsertConversation,
  type DirectMessage, type InsertDirectMessage,
  type UserPublicKey, type UserPresence,
} from "@shared/schema";

// ─── DB connection (lazy) ────────────────────────────────────────────────────
// Lazy initialization: the client is created on first use, not at module load.
// This is critical for Vercel serverless — env vars are available at request
// time, and deferring initialization avoids module-load-time failures.
let _client: ReturnType<typeof createClient> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getDb(): ReturnType<typeof drizzle> {
  if (!_db) {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;
    if (!tursoUrl) {
      throw new Error(
        "TURSO_DATABASE_URL is not set. Please set TURSO_DATABASE_URL in Vercel environment variables."
      );
    }
    const cleanUrl = tursoUrl.trim();
    _client = createClient({ url: cleanUrl, authToken: tursoToken?.trim() });
    _db = drizzle(_client);
  }
  return _db;
}

// Convenience alias
const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});

// ─── Init tables ─────────────────────────────────────────────────────────────
// We run CREATE TABLE IF NOT EXISTS via raw SQL so the app bootstraps itself
// without needing drizzle-kit push each time.
async function initTables() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      bio TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      cover_url TEXT DEFAULT '',
      location TEXT DEFAULT '',
      website TEXT DEFAULT '',
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      image_url TEXT DEFAULT '',
      feeling TEXT DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'public',
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      reaction TEXT NOT NULL DEFAULT 'like',
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL,
      addressee_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      actor_id INTEGER NOT NULL,
      post_id INTEGER,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_user_id INTEGER,
      claimed_token TEXT,
      presented_credential TEXT,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      ip_address TEXT,
      user_agent TEXT,
      detail TEXT,
      blocked INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    // ── Messenger tables ──────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_ids TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS direct_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      encrypted_payload TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS user_public_keys (
      user_id INTEGER PRIMARY KEY,
      public_key TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS user_presence (
      user_id INTEGER PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'offline',
      last_heartbeat TEXT NOT NULL
    )`,
  ];
  // Ensure DB is initialized before running table creation
  const client = _client ?? (getDb(), _client!);
  // Use batch() to send all CREATE TABLE statements in a single HTTP round-trip.
  // This is critical for Vercel serverless — 8 sequential requests would be too slow.
  await client.batch(stmts.map(sql => ({ sql })));
}

// Run table init immediately — fire-and-forget on Vercel (tables exist after first deploy).
// server/index.ts can still await this for local dev safety.
export const dbReady = initTables().catch((err) => {
  // Log but don't crash — tables likely already exist
  console.warn("[storage] initTables warning (non-fatal):", err?.message ?? err);
});

// ─── Storage interface ────────────────────────────────────────────────────────
export interface IStorage {
  // Users
  createUser(data: InsertUser): Promise<User>;
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  searchUsers(query: string, excludeId: number): Promise<User[]>;

  // Sessions
  createSession(data: InsertSession): Promise<Session>;
  getSessionByToken(token: string): Promise<Session | undefined>;
  deleteSession(token: string): Promise<void>;

  // Posts
  createPost(data: InsertPost): Promise<Post>;
  getPostById(id: number): Promise<Post | undefined>;
  getFeedPosts(userId: number, friendIds: number[]): Promise<Post[]>;
  getUserPosts(userId: number): Promise<Post[]>;
  deletePost(id: number): Promise<void>;

  // Comments
  createComment(data: InsertComment): Promise<Comment>;
  getCommentsByPost(postId: number): Promise<Comment[]>;
  deleteComment(id: number): Promise<void>;

  // Likes
  addLike(data: InsertLike): Promise<Like>;
  removeLike(postId: number, userId: number): Promise<void>;
  getLikesByPost(postId: number): Promise<Like[]>;
  getUserLike(postId: number, userId: number): Promise<Like | undefined>;

  // Friendships
  sendFriendRequest(data: InsertFriendship): Promise<Friendship>;
  getFriendship(userId1: number, userId2: number): Promise<Friendship | undefined>;
  updateFriendship(id: number, status: string): Promise<Friendship | undefined>;
  getFriends(userId: number): Promise<number[]>;
  getPendingRequests(userId: number): Promise<Friendship[]>;
  getSentRequests(userId: number): Promise<Friendship[]>;

  // Notifications
  createNotification(data: InsertNotification): Promise<Notification>;
  getNotifications(userId: number): Promise<Notification[]>;
  markNotificationsRead(userId: number): Promise<void>;
  getUnreadCount(userId: number): Promise<number>;

  // Security Events
  logSecurityEvent(data: InsertSecurityEvent): Promise<SecurityEvent>;
  getSecurityEvents(limit?: number): Promise<SecurityEvent[]>;
  getSecurityEventsByIp(ip: string): Promise<SecurityEvent[]>;
  countRecentFailedLogins(ip: string, windowMs: number): Promise<number>;

  // Password Reset
  createPasswordResetToken(userId: number, code: string, expiresAt: string): Promise<PasswordResetToken>;
  getValidResetToken(userId: number, code: string): Promise<PasswordResetToken | undefined>;
  markResetTokenUsed(id: number): Promise<void>;
  updateUserPassword(userId: number, hashedPassword: string): Promise<void>;

  // ── Messenger ────────────────────────────────────────────────────────────────
  getOrCreateConversation(userAId: number, userBId: number): Promise<Conversation>;
  getUserConversations(userId: number): Promise<Conversation[]>;
  getConversation(id: number): Promise<Conversation | undefined>;
  getDirectMessages(conversationId: number): Promise<DirectMessage[]>;
  createDirectMessage(data: InsertDirectMessage): Promise<DirectMessage>;
  markDirectMessageRead(id: number): Promise<void>;
  upsertPublicKey(userId: number, publicKey: string): Promise<void>;
  getPublicKey(userId: number): Promise<UserPublicKey | undefined>;
  upsertPresence(userId: number, status: string): Promise<void>;
  getPresence(userId: number): Promise<UserPresence | undefined>;
  getAllPresence(): Promise<UserPresence[]>;
  sweepStalePresence(thresholdMs: number): Promise<void>;

  // Stories
  createStory(data: InsertStory): Promise<Story>;
  getActiveStories(friendIds: number[], selfId: number): Promise<Story[]>;
  getUserStories(userId: number): Promise<Story[]>;
  deleteStory(id: number): Promise<void>;
  recordStoryView(storyId: number, viewerId: number): Promise<void>;
  getStoryViews(storyId: number): Promise<StoryView[]>;
  deleteExpiredStories(): Promise<void>;
}

export const storage: IStorage = {
  // ── Users ──────────────────────────────────────────────────────────────────
  async createUser(data) {
    const rows = await db.insert(users).values({ ...data, createdAt: new Date().toISOString() }).returning();
    return rows[0] as User;
  },
  async getUserById(id) {
    const rows = await db.select().from(users).where(eq(users.id, id));
    return rows[0] as User | undefined;
  },
  async getUserByEmail(email) {
    const rows = await db.select().from(users).where(eq(users.email, email));
    return rows[0] as User | undefined;
  },
  async getUserByUsername(username) {
    const rows = await db.select().from(users).where(eq(users.username, username));
    return rows[0] as User | undefined;
  },
  async updateUser(id, data) {
    const rows = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return rows[0] as User | undefined;
  },
  async searchUsers(query, excludeId) {
    if (!query) {
      // Return all users except self (for suggestions)
      return db.select().from(users).where(ne(users.id, excludeId)).limit(20) as Promise<User[]>;
    }
    return db.select().from(users)
      .where(and(
        ne(users.id, excludeId),
        or(
          sql`LOWER(${users.displayName}) LIKE ${'%' + query.toLowerCase() + '%'}`,
          sql`LOWER(${users.username}) LIKE ${'%' + query.toLowerCase() + '%'}`
        )
      ))
      .limit(20) as Promise<User[]>;
  },

  // ── Sessions ───────────────────────────────────────────────────────────────
  async createSession(data) {
    const rows = await db.insert(sessions).values({ ...data, createdAt: new Date().toISOString() }).returning();
    return rows[0] as Session;
  },
  async getSessionByToken(token) {
    const rows = await db.select().from(sessions).where(eq(sessions.token, token));
    return rows[0] as Session | undefined;
  },
  async deleteSession(token) {
    await db.delete(sessions).where(eq(sessions.token, token));
  },

  // ── Posts ──────────────────────────────────────────────────────────────────
  async createPost(data) {
    const rows = await db.insert(posts).values({ ...data, createdAt: new Date().toISOString() }).returning();
    return rows[0] as Post;
  },
  async getPostById(id) {
    const rows = await db.select().from(posts).where(eq(posts.id, id));
    return rows[0] as Post | undefined;
  },
  async getFeedPosts(userId, friendIds) {
    const ids = [...friendIds, userId];
    return db.select().from(posts)
      .where(inArray(posts.authorId, ids))
      .orderBy(desc(posts.createdAt))
      .limit(50) as Promise<Post[]>;
  },
  async getUserPosts(userId) {
    return db.select().from(posts)
      .where(eq(posts.authorId, userId))
      .orderBy(desc(posts.createdAt)) as Promise<Post[]>;
  },
  async deletePost(id) {
    await db.delete(posts).where(eq(posts.id, id));
  },

  // ── Comments ───────────────────────────────────────────────────────────────
  async createComment(data) {
    const rows = await db.insert(comments).values({ ...data, createdAt: new Date().toISOString() }).returning();
    return rows[0] as Comment;
  },
  async getCommentsByPost(postId) {
    return db.select().from(comments)
      .where(eq(comments.postId, postId))
      .orderBy(desc(comments.createdAt)) as Promise<Comment[]>;
  },
  async deleteComment(id) {
    await db.delete(comments).where(eq(comments.id, id));
  },

  // ── Likes ──────────────────────────────────────────────────────────────────
  async addLike(data) {
    const rows = await db.insert(likes).values({ ...data, createdAt: new Date().toISOString() }).returning();
    return rows[0] as Like;
  },
  async removeLike(postId, userId) {
    await db.delete(likes).where(and(eq(likes.postId, postId), eq(likes.userId, userId)));
  },
  async getLikesByPost(postId) {
    return db.select().from(likes).where(eq(likes.postId, postId)) as Promise<Like[]>;
  },
  async getUserLike(postId, userId) {
    const rows = await db.select().from(likes)
      .where(and(eq(likes.postId, postId), eq(likes.userId, userId)));
    return rows[0] as Like | undefined;
  },

  // ── Friendships ────────────────────────────────────────────────────────────
  async sendFriendRequest(data) {
    const rows = await db.insert(friendships).values({ ...data, createdAt: new Date().toISOString() }).returning();
    return rows[0] as Friendship;
  },
  async getFriendship(userId1, userId2) {
    const rows = await db.select().from(friendships)
      .where(or(
        and(eq(friendships.requesterId, userId1), eq(friendships.addresseeId, userId2)),
        and(eq(friendships.requesterId, userId2), eq(friendships.addresseeId, userId1))
      ));
    return rows[0] as Friendship | undefined;
  },
  async updateFriendship(id, status) {
    const rows = await db.update(friendships).set({ status }).where(eq(friendships.id, id)).returning();
    return rows[0] as Friendship | undefined;
  },
  async getFriends(userId) {
    const rows = await db.select().from(friendships)
      .where(and(
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
        eq(friendships.status, "accepted")
      )) as Friendship[];
    return rows.map(f => f.requesterId === userId ? f.addresseeId : f.requesterId);
  },
  async getPendingRequests(userId) {
    return db.select().from(friendships)
      .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, "pending"))) as Promise<Friendship[]>;
  },
  async getSentRequests(userId) {
    return db.select().from(friendships)
      .where(and(eq(friendships.requesterId, userId), eq(friendships.status, "pending"))) as Promise<Friendship[]>;
  },

  // ── Notifications ──────────────────────────────────────────────────────────
  async createNotification(data) {
    const rows = await db.insert(notifications).values({ ...data, createdAt: new Date().toISOString() }).returning();
    return rows[0] as Notification;
  },
  async getNotifications(userId) {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50) as Promise<Notification[]>;
  },
  async markNotificationsRead(userId) {
    await db.update(notifications).set({ read: 1 }).where(eq(notifications.userId, userId));
  },
  async getUnreadCount(userId) {
    const rows = await db.select({ count: sql<number>`count(*)` }).from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, 0)));
    return rows[0]?.count ?? 0;
  },

  // ── Security Events ────────────────────────────────────────────────────────
  async logSecurityEvent(data) {
    const rows = await db.insert(securityEvents).values({ ...data, createdAt: new Date().toISOString() }).returning();
    return rows[0] as SecurityEvent;
  },
  async getSecurityEvents(limit = 200) {
    return db.select().from(securityEvents)
      .orderBy(desc(securityEvents.createdAt))
      .limit(limit) as Promise<SecurityEvent[]>;
  },
  async getSecurityEventsByIp(ip) {
    return db.select().from(securityEvents)
      .where(eq(securityEvents.ipAddress, ip))
      .orderBy(desc(securityEvents.createdAt))
      .limit(100) as Promise<SecurityEvent[]>;
  },
  async countRecentFailedLogins(ip, windowMs) {
    const since = new Date(Date.now() - windowMs).toISOString();
    const rows = await db.select({ count: sql<number>`count(*)` })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.ipAddress, ip),
          eq(securityEvents.eventType, "brute_force"),
          sql`${securityEvents.createdAt} >= ${since}`
        )
      );
    return rows[0]?.count ?? 0;
  },

  // ── Password Reset ─────────────────────────────────────────────────────────
  async createPasswordResetToken(userId, code, expiresAt) {
    // Invalidate any previous unused tokens for this user
    await db.update(passwordResetTokens)
      .set({ used: 1 })
      .where(and(eq(passwordResetTokens.userId, userId), eq(passwordResetTokens.used, 0)));
    const rows = await db.insert(passwordResetTokens)
      .values({ userId, code, expiresAt, used: 0, createdAt: new Date().toISOString() })
      .returning();
    return rows[0] as PasswordResetToken;
  },
  async getValidResetToken(userId, code) {
    const now = new Date().toISOString();
    const rows = await db.select().from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.userId, userId),
        eq(passwordResetTokens.code, code),
        eq(passwordResetTokens.used, 0),
        sql`${passwordResetTokens.expiresAt} > ${now}`
      ));
    return rows[0] as PasswordResetToken | undefined;
  },
  async markResetTokenUsed(id) {
    await db.update(passwordResetTokens).set({ used: 1 }).where(eq(passwordResetTokens.id, id));
  },
  async updateUserPassword(userId, hashedPassword) {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
  },

  // ── Messenger ────────────────────────────────────────────────────────────────
  async getOrCreateConversation(userAId, userBId) {
    const db = getDb();
    const all = await db.select().from(conversations).all();
    const existing = all.find((c) => {
      const ids: number[] = JSON.parse(c.participantIds);
      return ids.includes(userAId) && ids.includes(userBId);
    });
    if (existing) return existing as Conversation;
    const rows = await db.insert(conversations)
      .values({ participantIds: JSON.stringify([userAId, userBId]), createdAt: new Date().toISOString() })
      .returning();
    return rows[0] as Conversation;
  },
  async getUserConversations(userId) {
    const db = getDb();
    const all = await db.select().from(conversations).all();
    return all.filter((c) => {
      const ids: number[] = JSON.parse(c.participantIds);
      return ids.includes(userId);
    }) as Conversation[];
  },
  async getConversation(id) {
    const db = getDb();
    const rows = await db.select().from(conversations).where(eq(conversations.id, id));
    return rows[0] as Conversation | undefined;
  },
  async getDirectMessages(conversationId) {
    const db = getDb();
    return db.select().from(directMessages)
      .where(eq(directMessages.conversationId, conversationId))
      .orderBy(directMessages.createdAt) as Promise<DirectMessage[]>;
  },
  async createDirectMessage(data) {
    const db = getDb();
    const rows = await db.insert(directMessages).values({ ...data, createdAt: new Date().toISOString() }).returning();
    return rows[0] as DirectMessage;
  },
  async markDirectMessageRead(id) {
    const db = getDb();
    await db.update(directMessages).set({ readAt: new Date().toISOString() }).where(eq(directMessages.id, id));
  },
  async upsertPublicKey(userId, publicKey) {
    const db = getDb();
    const existing = await db.select().from(userPublicKeys).where(eq(userPublicKeys.userId, userId));
    if (existing.length) {
      await db.update(userPublicKeys).set({ publicKey, updatedAt: new Date().toISOString() }).where(eq(userPublicKeys.userId, userId));
    } else {
      await db.insert(userPublicKeys).values({ userId, publicKey, updatedAt: new Date().toISOString() });
    }
  },
  async getPublicKey(userId) {
    const db = getDb();
    const rows = await db.select().from(userPublicKeys).where(eq(userPublicKeys.userId, userId));
    return rows[0] as UserPublicKey | undefined;
  },
  async upsertPresence(userId, status) {
    const db = getDb();
    const now = new Date().toISOString();
    const existing = await db.select().from(userPresence).where(eq(userPresence.userId, userId));
    if (existing.length) {
      await db.update(userPresence).set({ status, lastHeartbeat: now }).where(eq(userPresence.userId, userId));
    } else {
      await db.insert(userPresence).values({ userId, status, lastHeartbeat: now });
    }
  },
  async getPresence(userId) {
    const db = getDb();
    const rows = await db.select().from(userPresence).where(eq(userPresence.userId, userId));
    return rows[0] as UserPresence | undefined;
  },
  async getAllPresence() {
    const db = getDb();
    return db.select().from(userPresence) as Promise<UserPresence[]>;
  },
  async sweepStalePresence(thresholdMs) {
    const db = getDb();
    const cutoff = new Date(Date.now() - thresholdMs).toISOString();
    const stale = await db.select().from(userPresence)
      .where(and(ne(userPresence.status, "offline"), sql`${userPresence.lastHeartbeat} < ${cutoff}`));
    for (const p of stale) {
      await db.update(userPresence).set({ status: "offline" }).where(eq(userPresence.userId, p.userId));
    }
  },

  // ── Stories ────────────────────────────────────────────────────────────────

  async createStory(data: InsertStory): Promise<Story> {
    const db = getDb();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const [row] = await db.insert(stories).values({
      userId: data.userId,
      type: data.type ?? "text",
      mediaUrl: data.mediaUrl ?? null,
      content: data.content ?? null,
      bgColor: data.bgColor ?? "#F6A61E",
      expiresAt: data.expiresAt ?? expiresAt,
    }).returning();
    return row;
  },

  async getActiveStories(friendIds: number[], selfId: number): Promise<Story[]> {
    const db = getDb();
    const now = new Date().toISOString();
    const ids = [...friendIds, selfId];
    if (ids.length === 0) return [];
    return db.select().from(stories)
      .where(and(
        inArray(stories.userId, ids),
        gt(stories.expiresAt, now),
      ))
      .orderBy(desc(stories.createdAt));
  },

  async getUserStories(userId: number): Promise<Story[]> {
    const db = getDb();
    const now = new Date().toISOString();
    return db.select().from(stories)
      .where(and(eq(stories.userId, userId), gt(stories.expiresAt, now)))
      .orderBy(desc(stories.createdAt));
  },

  async deleteStory(id: number): Promise<void> {
    const db = getDb();
    await db.delete(stories).where(eq(stories.id, id));
  },

  async recordStoryView(storyId: number, viewerId: number): Promise<void> {
    const db = getDb();
    const existing = await db.select().from(storyViews)
      .where(and(eq(storyViews.storyId, storyId), eq(storyViews.viewerId, viewerId)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(storyViews).values({ storyId, viewerId });
    }
  },

  async getStoryViews(storyId: number): Promise<StoryView[]> {
    const db = getDb();
    return db.select().from(storyViews)
      .where(eq(storyViews.storyId, storyId))
      .orderBy(desc(storyViews.viewedAt));
  },

  async deleteExpiredStories(): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    await db.delete(stories).where(sql`${stories.expiresAt} <= ${now}`);
  },
};
