// Use drizzle-orm/libsql/web + @libsql/client/web for serverless compatibility.
// These variants use HTTP/WebSocket transport only — no native .node binaries.
// The default drizzle-orm/libsql uses @libsql/client which requires
// native linux-x64-gnu binaries that crash in Vercel serverless functions.
import { drizzle } from "drizzle-orm/libsql/web";
import { createClient } from "@libsql/client/web";
import { eq, or, and, desc, ne, inArray, sql } from "drizzle-orm";
import {
  users, posts, comments, likes, friendships, notifications, sessions, securityEvents,
  type User, type InsertUser,
  type Post, type InsertPost,
  type Comment, type InsertComment,
  type Like, type InsertLike,
  type Friendship, type InsertFriendship,
  type Notification, type InsertNotification,
  type Session, type InsertSession,
  type SecurityEvent, type InsertSecurityEvent,
} from "@shared/schema";

// ─── DB connection ────────────────────────────────────────────────────────────
// In production (Vercel): TURSO_DATABASE_URL + TURSO_AUTH_TOKEN must be set.
// In development (local): falls back to a local SQLite file via libsql.
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl) {
  throw new Error(
    "TURSO_DATABASE_URL is not set. Please set it to your Turso database URL."
  );
}

const client = createClient({
  url: tursoUrl,
  authToken: tursoToken,
});

const db = drizzle(client);

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
  ];
  for (const stmt of stmts) {
    await client.execute(stmt);
  }
}

// Run table init immediately — exported so server/index.ts can await it.
export const dbReady = initTables();

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
}

export const storage: IStorage = {
  // ── Users ──────────────────────────────────────────────────────────────────
  async createUser(data) {
    const rows = await db.insert(users).values(data).returning();
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
    const rows = await db.insert(sessions).values(data).returning();
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
    const rows = await db.insert(posts).values(data).returning();
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
    const rows = await db.insert(comments).values(data).returning();
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
    const rows = await db.insert(likes).values(data).returning();
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
    const rows = await db.insert(friendships).values(data).returning();
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
    const rows = await db.insert(notifications).values(data).returning();
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
    const rows = await db.insert(securityEvents).values(data).returning();
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
};
