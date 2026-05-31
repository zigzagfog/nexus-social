import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  bio: text("bio").default(""),
  avatarUrl: text("avatar_url").default(""),
  coverUrl: text("cover_url").default(""),
  location: text("location").default(""),
  website: text("website").default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─── Posts ────────────────────────────────────────────────────────────────────
export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  authorId: integer("author_id").notNull(),
  content: text("content").notNull(),
  imageUrl: text("image_url").default(""),
  feeling: text("feeling").default(""),
  visibility: text("visibility").notNull().default("public"), // public | friends | private
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertPostSchema = createInsertSchema(posts).omit({ id: true, createdAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;

// ─── Comments ─────────────────────────────────────────────────────────────────
export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id").notNull(),
  authorId: integer("author_id").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertCommentSchema = createInsertSchema(comments).omit({ id: true, createdAt: true });
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

// ─── Likes ────────────────────────────────────────────────────────────────────
export const likes = sqliteTable("likes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id").notNull(),
  userId: integer("user_id").notNull(),
  reaction: text("reaction").notNull().default("like"), // like | love | haha | wow | sad | angry
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertLikeSchema = createInsertSchema(likes).omit({ id: true, createdAt: true });
export type InsertLike = z.infer<typeof insertLikeSchema>;
export type Like = typeof likes.$inferSelect;

// ─── Friendships ──────────────────────────────────────────────────────────────
export const friendships = sqliteTable("friendships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requesterId: integer("requester_id").notNull(),
  addresseeId: integer("addressee_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | blocked
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertFriendshipSchema = createInsertSchema(friendships).omit({ id: true, createdAt: true });
export type InsertFriendship = z.infer<typeof insertFriendshipSchema>;
export type Friendship = typeof friendships.$inferSelect;

// ─── Notifications ────────────────────────────────────────────────────────────
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // like | comment | friend_request | friend_accepted
  actorId: integer("actor_id").notNull(),
  postId: integer("post_id"),
  read: integer("read").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// ─── Security Events ─────────────────────────────────────────────────────────
// Logs every suspected impersonation / credential-forgery attempt.
export const securityEvents = sqliteTable("security_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Who was being targeted (null if no valid session could be resolved)
  targetUserId: integer("target_user_id"),
  // The actor's claimed identity — may be a bearer token, cookie value, or raw credential
  claimedToken: text("claimed_token"),
  // The credential the attacker presented (hashed email/username, or raw if not sensitive)
  presentedCredential: text("presented_credential"),
  // Category of event
  eventType: text("event_type").notNull(), // 'token_forgery' | 'profile_tamper' | 'brute_force' | 'unauthorized_edit' | 'invalid_session'
  // Severity
  severity: text("severity").notNull().default("medium"), // 'low' | 'medium' | 'high' | 'critical'
  // Client IP (best-effort: X-Forwarded-For → socket remote address)
  ipAddress: text("ip_address"),
  // Full User-Agent string
  userAgent: text("user_agent"),
  // Freeform detail about what was attempted
  detail: text("detail"),
  // Whether the attempt succeeded despite detection
  blocked: integer("blocked").notNull().default(1), // 1 = blocked, 0 = slipped through
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertSecurityEventSchema = createInsertSchema(securityEvents).omit({ id: true, createdAt: true });
export type InsertSecurityEvent = z.infer<typeof insertSecurityEventSchema>;
export type SecurityEvent = typeof securityEvents.$inferSelect;

// ─── Sessions (simple token-based auth) ──────────────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, createdAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;
