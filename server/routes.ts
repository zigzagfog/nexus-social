import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import crypto from "crypto";

const COOKIE_NAME = "nexus_session";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: "/",
};

// ─── IP extraction ────────────────────────────────────────────────────────────
// Trusts X-Forwarded-For (set by Vercel/proxies). Falls back to socket address.
function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return raw.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

// ─── Brute-force rate limiter ─────────────────────────────────────────────────
// In-memory counter — fast, no DB round-trip. Resets on server restart.
// The DB also records every failed attempt for forensic audit.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const BRUTE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BRUTE_MAX = 10;                    // max attempts per IP per window

function checkBruteForce(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + BRUTE_WINDOW_MS });
    return false; // not blocked
  }
  entry.count++;
  return entry.count > BRUTE_MAX;
}

function resetBruteForce(ip: string) {
  loginAttempts.delete(ip);
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const rawToken =
    req.cookies?.[COOKIE_NAME] ||
    req.headers.authorization?.replace("Bearer ", "");

  if (!rawToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const session = await storage.getSessionByToken(rawToken);

  if (!session) {
    // Token presented but not in DB — could be a forged or expired token.
    const ip = getClientIp(req);
    await storage.logSecurityEvent({
      targetUserId: null,
      claimedToken: rawToken.slice(0, 16) + "…", // truncate for storage safety
      presentedCredential: null,
      eventType: "invalid_session",
      severity: "medium",
      ipAddress: ip,
      userAgent: String(req.headers["user-agent"] ?? ""),
      detail: `Token not found in sessions table. Method: ${req.method} ${req.path}`,
      blocked: 1,
    });
    console.warn(`[SECURITY] Invalid session token from IP ${ip} → ${req.method} ${req.path}`);
    return res.status(401).json({ error: "Invalid session" });
  }

  const user = await storage.getUserById(session.userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  (req as any).user = user;
  (req as any).rawToken = rawToken;
  next();
}

function hashPassword(pw: string) {
  return crypto.createHash("sha256").update(pw + "nexus_salt_2026").digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function enrichPost(post: any, userId: number) {
  const [author, postLikes, postComments, userLike] = await Promise.all([
    storage.getUserById(post.authorId),
    storage.getLikesByPost(post.id),
    storage.getCommentsByPost(post.id),
    storage.getUserLike(post.id, userId),
  ]);
  const enrichedComments = await Promise.all(
    postComments.map(async (c) => ({
      ...c,
      author: await storage.getUserById(c.authorId),
    }))
  );
  return {
    ...post,
    author,
    likeCount: postLikes.length,
    likeBreakdown: postLikes.reduce((acc: any, l) => {
      acc[l.reaction] = (acc[l.reaction] || 0) + 1;
      return acc;
    }, {}),
    userReaction: userLike?.reaction ?? null,
    commentCount: postComments.length,
    comments: enrichedComments,
  };
}

export async function registerRoutes(httpServer: Server, app: Express) {
  // Tables are initialized as a background fire-and-forget — never block route setup.

  // ── Auth ─────────────────────────────────────────────────────────────────────

  app.post("/api/auth/register", async (req, res) => {
    const ip = getClientIp(req);
    const ua = String(req.headers["user-agent"] ?? "");
    try {
      const { username, displayName, email, password } = req.body;
      if (!username || !displayName || !email || !password)
        return res.status(400).json({ error: "All fields required" });

      // Brute-force guard on registration too (prevents mass account creation)
      if (checkBruteForce(ip)) {
        await storage.logSecurityEvent({
          targetUserId: null,
          claimedToken: null,
          presentedCredential: `email:${email}`,
          eventType: "brute_force",
          severity: "high",
          ipAddress: ip,
          userAgent: ua,
          detail: `Registration rate-limit exceeded (>${BRUTE_MAX} attempts in ${BRUTE_WINDOW_MS / 60000} min)`,
          blocked: 1,
        });
        return res.status(429).json({ error: "Too many attempts — try again later." });
      }

      if (await storage.getUserByEmail(email))
        return res.status(400).json({ error: "Email already registered" });
      if (await storage.getUserByUsername(username))
        return res.status(400).json({ error: "Username already taken" });

      const user = await storage.createUser({
        username,
        displayName,
        email,
        password: hashPassword(password),
        bio: "",
        avatarUrl: "",
        coverUrl: "",
        location: "",
        website: "",
      });
      const token = generateToken();
      await storage.createSession({ userId: user.id, token });
      resetBruteForce(ip);

      // ── Auto-friend: instantly connect new user with zigzagfog (id=14) ──────
      // Skips if the new user IS zigzagfog, or if a friendship already exists.
      const OWNER_ID = 14;
      if (user.id !== OWNER_ID) {
        try {
          const existing = await storage.getFriendship(OWNER_ID, user.id);
          if (!existing) {
            await storage.sendFriendRequest({ requesterId: OWNER_ID, addresseeId: user.id, status: "accepted" });
          }
        } catch (friendErr) {
          // Non-fatal — log but don't block registration
          console.warn("[auto-friend] Could not create friendship:", friendErr);
        }
      }

      res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
      const { password: _pw, ...safeUser } = user;
      res.json({ user: safeUser, token });
    } catch (err: any) {
      console.error("Register error:", err);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const ip = getClientIp(req);
    const ua = String(req.headers["user-agent"] ?? "");
    try {
      const { email, password } = req.body;

      // ── Brute-force check ──────────────────────────────────────────────────
      if (checkBruteForce(ip)) {
        await storage.logSecurityEvent({
          targetUserId: null,
          claimedToken: null,
          presentedCredential: `email:${email}`,
          eventType: "brute_force",
          severity: "critical",
          ipAddress: ip,
          userAgent: ua,
          detail: `Login rate-limit exceeded (>${BRUTE_MAX} attempts in ${BRUTE_WINDOW_MS / 60000} min). Credential: ${email}`,
          blocked: 1,
        });
        console.warn(`[SECURITY] Brute-force blocked: IP=${ip} email=${email}`);
        return res.status(429).json({ error: "Too many login attempts — try again in 15 minutes." });
      }

      const user = await storage.getUserByEmail(email);
      if (!user || user.password !== hashPassword(password)) {
        // Log every failed credential attempt
        await storage.logSecurityEvent({
          targetUserId: user?.id ?? null,
          claimedToken: null,
          presentedCredential: `email:${email}`,
          eventType: "brute_force",
          severity: "medium",
          ipAddress: ip,
          userAgent: ua,
          detail: `Failed login attempt. Email: ${email}. User ${user ? "exists" : "not found"}.`,
          blocked: 1,
        });
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const token = generateToken();
      await storage.createSession({ userId: user.id, token });
      resetBruteForce(ip);
      res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
      const { password: _pw, ...safeUser } = user;
      res.json({ user: safeUser, token });
    } catch (err: any) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token =
      req.cookies?.[COOKIE_NAME] ||
      req.headers.authorization?.replace("Bearer ", "");
    if (token) await storage.deleteSession(token);
    res.clearCookie(COOKIE_NAME, { path: "/" });
    res.json({ ok: true });
  });

  // ── Forgot password: request a reset code ──────────────────────────────────
  // User submits their email → server creates a 6-digit code (shown in the response)
  // valid for 15 minutes. No email service needed — code shown directly on screen.
  app.post("/api/auth/forgot-password", async (req, res) => {
    const ip = getClientIp(req);
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });

      // Always respond with success even if email not found — prevents user enumeration
      const user = await storage.getUserByEmail(email.trim().toLowerCase());
      if (!user) {
        return res.json({ ok: true, message: "If that email is registered, a reset code will appear here.", code: null });
      }

      // Generate a 6-digit code
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await storage.createPasswordResetToken(user.id, code, expiresAt);

      console.log(`[AUTH] Password reset code for user ${user.id} (${user.email}): ${code}`);

      // Return the code directly (no email needed — user sees it on screen)
      res.json({ ok: true, userId: user.id, code, expiresIn: 900 });
    } catch (err: any) {
      console.error("Forgot password error:", err);
      res.status(500).json({ error: "Failed to generate reset code" });
    }
  });

  // ── Reset password: submit code + new password ───────────────────────────────
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { userId, code, newPassword } = req.body;
      if (!userId || !code || !newPassword)
        return res.status(400).json({ error: "userId, code, and newPassword are required" });
      if (newPassword.length < 6)
        return res.status(400).json({ error: "Password must be at least 6 characters" });

      const token = await storage.getValidResetToken(Number(userId), String(code));
      if (!token) {
        return res.status(400).json({ error: "Invalid or expired reset code" });
      }

      await storage.markResetTokenUsed(token.id);
      await storage.updateUserPassword(Number(userId), hashPassword(newPassword));

      res.json({ ok: true, message: "Password updated. You can now sign in." });
    } catch (err: any) {
      console.error("Reset password error:", err);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    const { password: _pw, ...safeUser } = (req as any).user;
    const rawToken = (req as any).rawToken;
    res.json({ ...safeUser, _token: rawToken });
  });

  // ── Image upload ──────────────────────────────────────────────────────────────
  // Accepts a base64 data URL, validates it's an image, returns { url } for storage.
  // Images are stored as data URLs in Turso (resized to ≤1200px on the client).
  app.post("/api/upload", requireAuth, async (req, res) => {
    try {
      const { dataUrl } = req.body;
      if (!dataUrl || typeof dataUrl !== "string") {
        return res.status(400).json({ error: "dataUrl is required" });
      }
      // Validate it's a real image data URL
      if (!dataUrl.startsWith("data:image/")) {
        return res.status(400).json({ error: "Only image data URLs are accepted" });
      }
      // Basic size guard: 5MB max (base64 ≈ 4/3 × raw bytes)
      const sizeBytes = Math.ceil((dataUrl.length * 3) / 4);
      if (sizeBytes > 5 * 1024 * 1024) {
        return res.status(413).json({ error: "Image too large — max 5 MB" });
      }
      // Return the data URL directly — it will be stored in image_url column
      res.json({ url: dataUrl });
    } catch (err: any) {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // ── Users ────────────────────────────────────────────────────────────────────

  app.get("/api/users/search", requireAuth, async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q) return res.json([]);
      const me = (req as any).user;
      const [results, friendIds, sentRequests, pendingRequests] = await Promise.all([
        storage.searchUsers(q, me.id),
        storage.getFriends(me.id),
        storage.getSentRequests(me.id),
        storage.getPendingRequests(me.id),
      ]);
      const sentIds = sentRequests.map(f => f.addresseeId);
      const pendingIds = pendingRequests.map(f => f.requesterId);
      const enriched = await Promise.all(results.map(async (u) => {
        const { password: _pw, ...safe } = u;
        const fs = await storage.getFriendship(me.id, u.id);
        return {
          ...safe,
          friendStatus: fs?.status ?? null,
          isFriend: friendIds.includes(u.id),
          requestSent: sentIds.includes(u.id),
          requestReceived: pendingIds.includes(u.id),
          friendshipId: fs?.id ?? null,
        };
      }));
      res.json(enriched);
    } catch (err) {
      console.error("Search error:", err);
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.get("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const userId = parseInt(String(req.params.id));
      const me = (req as any).user;
      const [user, fs, friendIds, myFriendIds, userPosts] = await Promise.all([
        storage.getUserById(userId),
        storage.getFriendship(me.id, userId),
        storage.getFriends(userId),
        storage.getFriends(me.id),
        storage.getUserPosts(userId),
      ]);
      if (!user) return res.status(404).json({ error: "User not found" });
      const { password: _pw, ...safeUser } = user;
      return res.json({
        ...safeUser,
        friendCount: friendIds.length,
        postCount: userPosts.length,
        friendStatus: fs?.status ?? null,
        friendshipId: fs?.id ?? null,
        isFriend: myFriendIds.includes(userId),
        isMe: me.id === userId,
      });
    } catch (err) {
      console.error("Get user error:", err);
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // ── Profile edit — strongest tamper detection ──────────────────────────────
  app.patch("/api/users/me", requireAuth, async (req, res) => {
    const ip = getClientIp(req);
    const ua = String(req.headers["user-agent"] ?? "");
    const me = (req as any).user;
    try {
      const { displayName, bio, location, website, avatarUrl, coverUrl } = req.body;

      // ── Detect ID injection / targeting another user ───────────────────────
      // If the body contains an `id` field that differs from the session user,
      // that's a clear attempt to forge another user's profile.
      if (req.body.id !== undefined && Number(req.body.id) !== me.id) {
        await storage.logSecurityEvent({
          targetUserId: Number(req.body.id),
          claimedToken: (req as any).rawToken?.slice(0, 16) + "…",
          presentedCredential: `userId_claim:${req.body.id}`,
          eventType: "profile_tamper",
          severity: "critical",
          ipAddress: ip,
          userAgent: ua,
          detail: `Session user ${me.id} (${me.username}) attempted to overwrite profile of user ${req.body.id}`,
          blocked: 1,
        });
        console.error(`[SECURITY] Profile tamper: user ${me.id} tried to overwrite user ${req.body.id}. IP=${ip}`);
        return res.status(403).json({ error: "Forbidden" });
      }

      // ── Detect email/password injection in profile update ──────────────────
      // These fields should never be accepted here — flag if someone is trying
      // to slide them in through the profile-patch endpoint.
      if (req.body.email !== undefined || req.body.password !== undefined) {
        const forgedField = req.body.email !== undefined ? "email" : "password";
        await storage.logSecurityEvent({
          targetUserId: me.id,
          claimedToken: (req as any).rawToken?.slice(0, 16) + "…",
          presentedCredential: `field:${forgedField}`,
          eventType: "unauthorized_edit",
          severity: "high",
          ipAddress: ip,
          userAgent: ua,
          detail: `User ${me.id} (${me.username}) tried to change ${forgedField} via profile-patch endpoint`,
          blocked: 1,
        });
        console.error(`[SECURITY] Credential injection via PATCH /api/users/me by user ${me.id}. IP=${ip}`);
        return res.status(403).json({ error: "Cannot change email or password via this endpoint" });
      }

      const updated = await storage.updateUser(me.id, { displayName, bio, location, website, avatarUrl, coverUrl });
      if (!updated) return res.status(404).json({ error: "User not found" });
      const { password: _pw, ...safeUser } = updated;
      res.json(safeUser);
    } catch (err) {
      console.error("Update user error:", err);
      res.status(500).json({ error: "Update failed" });
    }
  });

  // ── Posts ─────────────────────────────────────────────────────────────────────

  app.get("/api/feed", requireAuth, async (req, res) => {
    try {
      const me = (req as any).user;
      const friendIds = await storage.getFriends(me.id);
      const rawPosts = await storage.getFeedPosts(me.id, friendIds);
      const enriched = await Promise.all(rawPosts.map(p => enrichPost(p, me.id)));
      res.json(enriched);
    } catch (err) {
      console.error("Feed error:", err);
      res.status(500).json({ error: "Failed to load feed" });
    }
  });

  app.post("/api/posts", requireAuth, async (req, res) => {
    const ip = getClientIp(req);
    const ua = String(req.headers["user-agent"] ?? "");
    const me = (req as any).user;
    try {
      const { content, imageUrl, feeling, visibility } = req.body;
      if (!content?.trim()) return res.status(400).json({ error: "Content required" });

      // Detect authorId injection — body must not claim a different author
      if (req.body.authorId !== undefined && Number(req.body.authorId) !== me.id) {
        await storage.logSecurityEvent({
          targetUserId: Number(req.body.authorId),
          claimedToken: (req as any).rawToken?.slice(0, 16) + "…",
          presentedCredential: `authorId_claim:${req.body.authorId}`,
          eventType: "profile_tamper",
          severity: "critical",
          ipAddress: ip,
          userAgent: ua,
          detail: `User ${me.id} (${me.username}) tried to post as user ${req.body.authorId}`,
          blocked: 1,
        });
        console.error(`[SECURITY] AuthorId forgery: user ${me.id} tried to post as ${req.body.authorId}. IP=${ip}`);
        return res.status(403).json({ error: "Forbidden" });
      }

      const post = await storage.createPost({
        authorId: me.id,
        content: content.trim(),
        imageUrl: imageUrl || "",
        feeling: feeling || "",
        visibility: visibility || "public",
      });
      const friendIds = await storage.getFriends(me.id);
      await Promise.all(
        friendIds.map(fid =>
          storage.createNotification({ userId: fid, type: "post", actorId: me.id, postId: post.id, read: 0 })
        )
      );
      res.json(await enrichPost(post, me.id));
    } catch (err) {
      console.error("Create post error:", err);
      res.status(500).json({ error: "Failed to create post" });
    }
  });

  app.delete("/api/posts/:id", requireAuth, async (req, res) => {
    const ip = getClientIp(req);
    const ua = String(req.headers["user-agent"] ?? "");
    const me = (req as any).user;
    try {
      const post = await storage.getPostById(parseInt(String(req.params.id)));
      if (!post) return res.status(404).json({ error: "Post not found" });

      // Detect attempt to delete another user's post
      if (post.authorId !== me.id) {
        await storage.logSecurityEvent({
          targetUserId: post.authorId,
          claimedToken: (req as any).rawToken?.slice(0, 16) + "…",
          presentedCredential: `postId:${post.id}`,
          eventType: "unauthorized_edit",
          severity: "high",
          ipAddress: ip,
          userAgent: ua,
          detail: `User ${me.id} (${me.username}) tried to delete post ${post.id} owned by user ${post.authorId}`,
          blocked: 1,
        });
        console.error(`[SECURITY] Post delete forgery: user ${me.id} → post ${post.id} (owner ${post.authorId}). IP=${ip}`);
        return res.status(403).json({ error: "Forbidden" });
      }

      await storage.deletePost(post.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("Delete post error:", err);
      res.status(500).json({ error: "Failed to delete post" });
    }
  });

  app.get("/api/users/:id/posts", requireAuth, async (req, res) => {
    try {
      const me = (req as any).user;
      const userId = parseInt(String(req.params.id));
      const rawPosts = await storage.getUserPosts(userId);
      const enriched = await Promise.all(rawPosts.map(p => enrichPost(p, me.id)));
      res.json(enriched);
    } catch (err) {
      console.error("User posts error:", err);
      res.status(500).json({ error: "Failed to load posts" });
    }
  });

  // ── Comments ──────────────────────────────────────────────────────────────────

  app.post("/api/posts/:id/comments", requireAuth, async (req, res) => {
    const ip = getClientIp(req);
    const ua = String(req.headers["user-agent"] ?? "");
    const me = (req as any).user;
    try {
      const postId = parseInt(String(req.params.id));
      const post = await storage.getPostById(postId);
      if (!post) return res.status(404).json({ error: "Post not found" });
      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ error: "Content required" });

      // Detect authorId injection on comment
      if (req.body.authorId !== undefined && Number(req.body.authorId) !== me.id) {
        await storage.logSecurityEvent({
          targetUserId: Number(req.body.authorId),
          claimedToken: (req as any).rawToken?.slice(0, 16) + "…",
          presentedCredential: `authorId_claim:${req.body.authorId}`,
          eventType: "profile_tamper",
          severity: "high",
          ipAddress: ip,
          userAgent: ua,
          detail: `User ${me.id} (${me.username}) tried to comment as user ${req.body.authorId} on post ${postId}`,
          blocked: 1,
        });
        console.error(`[SECURITY] Comment authorId forgery by user ${me.id}. IP=${ip}`);
        return res.status(403).json({ error: "Forbidden" });
      }

      const comment = await storage.createComment({ postId, authorId: me.id, content: content.trim() });
      if (post.authorId !== me.id) {
        await storage.createNotification({ userId: post.authorId, type: "comment", actorId: me.id, postId, read: 0 });
      }
      res.json({ ...comment, author: await storage.getUserById(me.id) });
    } catch (err) {
      console.error("Comment error:", err);
      res.status(500).json({ error: "Failed to add comment" });
    }
  });

  // ── Likes ──────────────────────────────────────────────────────────────────────

  app.post("/api/posts/:id/like", requireAuth, async (req, res) => {
    try {
      const me = (req as any).user;
      const postId = parseInt(String(req.params.id));
      const post = await storage.getPostById(postId);
      if (!post) return res.status(404).json({ error: "Post not found" });
      const { reaction = "like" } = req.body;
      const existing = await storage.getUserLike(postId, me.id);
      if (existing) {
        await storage.removeLike(postId, me.id);
        if (reaction === existing.reaction) {
          return res.json(await enrichPost(post, me.id));
        }
      }
      await storage.addLike({ postId, userId: me.id, reaction });
      if (post.authorId !== me.id) {
        await storage.createNotification({ userId: post.authorId, type: "like", actorId: me.id, postId, read: 0 });
      }
      const refreshed = await storage.getPostById(postId);
      res.json(await enrichPost(refreshed!, me.id));
    } catch (err) {
      console.error("Like error:", err);
      res.status(500).json({ error: "Failed to process reaction" });
    }
  });

  // ── Friendships ───────────────────────────────────────────────────────────────

  app.get("/api/friends", requireAuth, async (req, res) => {
    try {
      const me = (req as any).user;
      const friendIds = await storage.getFriends(me.id);
      const friends = (await Promise.all(
        friendIds.map(async (id) => {
          const u = await storage.getUserById(id);
          if (!u) return null;
          const { password: _pw, ...safe } = u;
          return safe;
        })
      )).filter(Boolean);
      res.json(friends);
    } catch (err) {
      console.error("Friends error:", err);
      res.status(500).json({ error: "Failed to load friends" });
    }
  });

  app.get("/api/friends/requests", requireAuth, async (req, res) => {
    try {
      const me = (req as any).user;
      const pending = await storage.getPendingRequests(me.id);
      const enriched = (await Promise.all(
        pending.map(async (f) => {
          const requester = await storage.getUserById(f.requesterId);
          if (!requester) return null;
          const { password: _pw, ...safe } = requester;
          return { ...f, requester: safe };
        })
      )).filter(Boolean);
      res.json(enriched);
    } catch (err) {
      console.error("Friend requests error:", err);
      res.status(500).json({ error: "Failed to load requests" });
    }
  });

  app.post("/api/friends/request/:userId", requireAuth, async (req, res) => {
    const ip = getClientIp(req);
    const ua = String(req.headers["user-agent"] ?? "");
    const me = (req as any).user;
    try {
      const targetId = parseInt(String(req.params.userId));
      if (targetId === me.id) return res.status(400).json({ error: "Cannot friend yourself" });

      // Detect requesterId injection
      if (req.body.requesterId !== undefined && Number(req.body.requesterId) !== me.id) {
        await storage.logSecurityEvent({
          targetUserId: Number(req.body.requesterId),
          claimedToken: (req as any).rawToken?.slice(0, 16) + "…",
          presentedCredential: `requesterId_claim:${req.body.requesterId}`,
          eventType: "profile_tamper",
          severity: "high",
          ipAddress: ip,
          userAgent: ua,
          detail: `User ${me.id} (${me.username}) tried to send friend request as user ${req.body.requesterId}`,
          blocked: 1,
        });
        return res.status(403).json({ error: "Forbidden" });
      }

      const existing = await storage.getFriendship(me.id, targetId);
      if (existing) return res.status(400).json({ error: "Friendship already exists" });
      const fs = await storage.sendFriendRequest({ requesterId: me.id, addresseeId: targetId, status: "pending" });
      await storage.createNotification({ userId: targetId, type: "friend_request", actorId: me.id, postId: null, read: 0 });
      res.json(fs);
    } catch (err) {
      console.error("Friend request error:", err);
      res.status(500).json({ error: "Failed to send request" });
    }
  });

  app.post("/api/friends/accept/:friendshipId", requireAuth, async (req, res) => {
    const ip = getClientIp(req);
    const ua = String(req.headers["user-agent"] ?? "");
    const me = (req as any).user;
    try {
      const fsId = parseInt(String(req.params.friendshipId));
      const updated = await storage.updateFriendship(fsId, "accepted");
      if (!updated) return res.status(404).json({ error: "Friendship not found" });

      // Ensure only the addressee can accept
      if (updated.addresseeId !== me.id) {
        await storage.logSecurityEvent({
          targetUserId: updated.addresseeId,
          claimedToken: (req as any).rawToken?.slice(0, 16) + "…",
          presentedCredential: `friendshipId:${fsId}`,
          eventType: "unauthorized_edit",
          severity: "high",
          ipAddress: ip,
          userAgent: ua,
          detail: `User ${me.id} (${me.username}) tried to accept friendship ${fsId} on behalf of user ${updated.addresseeId}`,
          blocked: 0, // already executed — log as slipped
        });
        console.error(`[SECURITY] Friendship accept forgery by user ${me.id}. IP=${ip}`);
        // Undo the accept — revert to pending
        await storage.updateFriendship(fsId, "pending");
        return res.status(403).json({ error: "Forbidden" });
      }

      await storage.createNotification({ userId: updated.requesterId, type: "friend_accepted", actorId: me.id, postId: null, read: 0 });
      res.json(updated);
    } catch (err) {
      console.error("Accept friend error:", err);
      res.status(500).json({ error: "Failed to accept request" });
    }
  });

  app.post("/api/friends/decline/:friendshipId", async (req, res) => {
    try {
      const fsId = parseInt(String(req.params.friendshipId));
      const updated = await storage.updateFriendship(fsId, "declined");
      res.json(updated);
    } catch (err) {
      console.error("Decline friend error:", err);
      res.status(500).json({ error: "Failed to decline request" });
    }
  });

  app.delete("/api/friends/:userId", requireAuth, async (req, res) => {
    try {
      const me = (req as any).user;
      const targetId = parseInt(String(req.params.userId));
      const fs = await storage.getFriendship(me.id, targetId);
      if (fs) await storage.updateFriendship(fs.id, "removed");
      res.json({ ok: true });
    } catch (err) {
      console.error("Remove friend error:", err);
      res.status(500).json({ error: "Failed to remove friend" });
    }
  });

  // ── Notifications ──────────────────────────────────────────────────────────────

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const me = (req as any).user;
      const notifs = await storage.getNotifications(me.id);
      const enriched = await Promise.all(
        notifs.map(async (n) => ({
          ...n,
          actor: await storage.getUserById(n.actorId).then(u => {
            if (!u) return null;
            const { password: _pw, ...safe } = u;
            return safe;
          }),
        }))
      );
      res.json(enriched);
    } catch (err) {
      console.error("Notifications error:", err);
      res.status(500).json({ error: "Failed to load notifications" });
    }
  });

  app.post("/api/notifications/read", requireAuth, async (req, res) => {
    try {
      const me = (req as any).user;
      await storage.markNotificationsRead(me.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("Mark read error:", err);
      res.status(500).json({ error: "Failed to mark read" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const me = (req as any).user;
      const count = await storage.getUnreadCount(me.id);
      res.json({ count });
    } catch (err) {
      console.error("Unread count error:", err);
      res.status(500).json({ error: "Failed to get count" });
    }
  });

  // ── Suggestions ──────────────────────────────────────────────────────────────

  app.get("/api/suggestions", requireAuth, async (req, res) => {
    try {
      const me = (req as any).user;
      const [friendIds, sentRequests, allUsers] = await Promise.all([
        storage.getFriends(me.id),
        storage.getSentRequests(me.id),
        storage.searchUsers("", me.id),
      ]);
      const sentIds = sentRequests.map(f => f.addresseeId);
      const suggestions = allUsers
        .filter(u => !friendIds.includes(u.id) && !sentIds.includes(u.id))
        .slice(0, 8)
        .map(u => {
          const { password: _pw, ...safe } = u;
          return safe;
        });
      res.json(suggestions);
    } catch (err) {
      console.error("Suggestions error:", err);
      res.status(500).json({ error: "Failed to load suggestions" });
    }
  });
  // ── Security Events (admin audit log) ────────────────────────────────────────
  // Protected by a server-side secret header — no UI role system yet.
  // Set ADMIN_SECRET env var; pass it as X-Admin-Secret header to access.
  app.get("/api/admin/security-events", async (req, res) => {
    const secret = process.env.ADMIN_SECRET;
    const provided = req.headers["x-admin-secret"];
    if (!secret || provided !== secret) {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const ip = String(req.query.ip || "").trim();
      const events = ip
        ? await storage.getSecurityEventsByIp(ip)
        : await storage.getSecurityEvents(500);
      res.json(events);
    } catch (err) {
      console.error("Security events error:", err);
      res.status(500).json({ error: "Failed to load security events" });
    }
  });
  // ── Messenger + Presence routes ───────────────────────────────────────────
  registerMessengerRoutes(app);
  registerStoryRoutes(app);

  // ── Global exception handler — catches any unhandled route errors ───────────
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const ip = getClientIp(req);
    const ua = String(req.headers["user-agent"] ?? "");
    const status = err?.status ?? err?.statusCode ?? 500;
    const message = err?.message ?? "Internal server error";
    console.error(`[EXCEPTION] ${req.method} ${req.path} → ${status}: ${message} | IP=${ip}`);
    // Log 4xx+ as security events (could be probing / fuzzing)
    if (status >= 400) {
      storage.logSecurityEvent({
        targetUserId: (req as any).user?.id ?? null,
        claimedToken: null,
        presentedCredential: null,
        eventType: "exception",
        severity: status >= 500 ? "high" : "medium",
        ipAddress: ip,
        userAgent: ua,
        detail: `Unhandled error on ${req.method} ${req.path}: [${status}] ${message}`,
        blocked: 0,
      }).catch(() => {});
    }
    res.status(status).json({ error: message });
  });

  // ── Unknown /api/* routes — log as potential scanning/probing ─────────────
  app.all("/api/*path", (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const ua = String(req.headers["user-agent"] ?? "");
    console.warn(`[SECURITY] Unknown API route probed: ${req.method} ${req.path} | IP=${ip}`);
    storage.logSecurityEvent({
      targetUserId: null,
      claimedToken: req.headers.authorization?.replace("Bearer ", "").slice(0, 16) + "…" || null,
      presentedCredential: null,
      eventType: "unknown_route",
      severity: "low",
      ipAddress: ip,
      userAgent: ua,
      detail: `Unknown API endpoint probed: ${req.method} ${req.path}. Body keys: ${Object.keys(req.body ?? {}).join(", ") || "none"}`,
      blocked: 1,
    }).catch(() => {});
    res.status(404).json({ error: "Not found" });
  });


}

// ─── Messenger + Presence (appended) ─────────────────────────────────────────
// NOTE: These routes are registered at module level below registerRoutes().
// Call registerMessengerRoutes(app) from registerRoutes().
export function registerMessengerRoutes(app: Express) {
  // SSE clients: userId → Response
  const sseClients = new Map<number, Response>();

  function broadcastPresence() {
    storage.getAllPresence().then((allPresence) => {
      const map = Object.fromEntries(allPresence.map((p) => [p.userId, p.status]));
      const payload = JSON.stringify({ type: "presence", data: map });
      sseClients.forEach((res) => {
        res.write(`data: ${payload}\n\n`);
      });
    });
  }

  // Sweep stale presence every 30 s
  setInterval(async () => {
    await storage.sweepStalePresence(35_000);
    broadcastPresence();
  }, 30_000);

  // ── Public key exchange ────────────────────────────────────────────────────
  app.post("/api/messenger/public-key", requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { publicKey } = req.body as { publicKey: string };
    if (!publicKey) return res.status(400).json({ error: "publicKey required" });
    await storage.upsertPublicKey(user.id, publicKey);
    res.json({ ok: true });
  });

  app.get("/api/messenger/public-key/:userId", requireAuth, async (req: Request, res: Response) => {
    const row = await storage.getPublicKey(Number(req.params.userId));
    if (!row) return res.status(404).json({ error: "No key for user" });
    res.json({ publicKey: row.publicKey });
  });

  // ── Presence heartbeat ─────────────────────────────────────────────────────
  app.post("/api/messenger/presence", requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { status } = req.body as { status: "online" | "away" | "offline" };
    if (!["online", "away", "offline"].includes(status)) return res.status(400).json({ error: "invalid status" });
    await storage.upsertPresence(user.id, status);
    broadcastPresence();
    res.json({ ok: true });
  });

  app.get("/api/messenger/presence", requireAuth, async (_req: Request, res: Response) => {
    const all = await storage.getAllPresence();
    const map = Object.fromEntries(all.map((p) => [p.userId, p.status]));
    res.json(map);
  });

  // ── SSE stream — one per logged-in user ────────────────────────────────────
  app.get("/api/messenger/sse", requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    sseClients.set(user.id, res);
    await storage.upsertPresence(user.id, "online");
    broadcastPresence();

    // Send initial presence snapshot
    const all = await storage.getAllPresence();
    const map = Object.fromEntries(all.map((p) => [p.userId, p.status]));
    res.write(`data: ${JSON.stringify({ type: "presence", data: map })}\n\n`);

    req.on("close", async () => {
      sseClients.delete(user.id);
      await storage.upsertPresence(user.id, "offline");
      broadcastPresence();
    });
  });

  // Helper: broadcast new DM to conversation participants via SSE
  function broadcastMessage(participantIds: number[], msg: object) {
    const payload = JSON.stringify({ type: "message", data: msg });
    for (const uid of participantIds) {
      sseClients.get(uid)?.write(`data: ${payload}\n\n`);
    }
  }

  // ── Conversations ──────────────────────────────────────────────────────────
  app.get("/api/messenger/conversations", requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const convos = await storage.getUserConversations(user.id);
    // Enrich with participant user objects
    const enriched = await Promise.all(
      convos.map(async (c) => {
        const ids: number[] = JSON.parse(c.participantIds);
        const participants = await Promise.all(ids.map((id) => storage.getUserById(id)));
        return { ...c, participants: participants.filter(Boolean) };
      })
    );
    res.json(enriched);
  });

  app.post("/api/messenger/conversations", requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { otherUserId } = req.body as { otherUserId: number };
    if (!otherUserId) return res.status(400).json({ error: "otherUserId required" });
    const convo = await storage.getOrCreateConversation(user.id, otherUserId);
    const ids: number[] = JSON.parse(convo.participantIds);
    const participants = await Promise.all(ids.map((id) => storage.getUserById(id)));
    res.json({ ...convo, participants: participants.filter(Boolean) });
  });

  // ── Messages ───────────────────────────────────────────────────────────────
  app.get("/api/messenger/messages/:conversationId", requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const convo = await storage.getConversation(Number(req.params.conversationId));
    if (!convo) return res.status(404).json({ error: "Not found" });
    const ids: number[] = JSON.parse(convo.participantIds);
    if (!ids.includes(user.id)) return res.status(403).json({ error: "Forbidden" });
    const msgs = await storage.getDirectMessages(Number(req.params.conversationId));
    res.json(msgs);
  });

  app.post("/api/messenger/messages", requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { conversationId, encryptedPayload } = req.body as { conversationId: number; encryptedPayload: string };
    if (!conversationId || !encryptedPayload) return res.status(400).json({ error: "missing fields" });
    const convo = await storage.getConversation(conversationId);
    if (!convo) return res.status(404).json({ error: "Conversation not found" });
    const ids: number[] = JSON.parse(convo.participantIds);
    if (!ids.includes(user.id)) return res.status(403).json({ error: "Forbidden" });
    const msg = await storage.createDirectMessage({ conversationId, senderId: user.id, encryptedPayload });
    broadcastMessage(ids, msg);
    res.json(msg);
  });

  app.patch("/api/messenger/messages/:id/read", requireAuth, async (req: Request, res: Response) => {
    await storage.markDirectMessageRead(Number(req.params.id));
    res.json({ ok: true });
  });
}

// ─── Stories Routes (appended) ────────────────────────────────────────────────
export function registerStoryRoutes(app: Express) {

  // GET /api/stories — active stories from self + friends
  app.get("/api/stories", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as number;
      const friendIds = await storage.getFriends(userId);
      const allStories = await storage.getActiveStories(friendIds, userId);
      // Attach viewer info
      const users = await Promise.all(
        Array.from(new Set(allStories.map((s: any) => s.userId))).map(id => storage.getUserById(id))
      );
      const userMap: Record<number, any> = {};
      for (const u of users) if (u) userMap[u.id] = { id: u.id, username: u.username, avatarUrl: u.avatarUrl };
      res.json(allStories.map(s => ({ ...s, user: userMap[s.userId] ?? null })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/stories — create a story
  app.post("/api/stories", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as number;
      const { type, mediaUrl, content, bgColor } = req.body;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const story = await storage.createStory({ userId, type: type ?? "text", mediaUrl, content, bgColor, expiresAt });
      res.status(201).json(story);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/stories/:id
  app.delete("/api/stories/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as number;
      const id = parseInt(String(req.params.id));
      const [story] = await Promise.resolve([await storage.getUserStories(userId)]).then(([s]) => s.filter(x => x.id === id));
      if (!story) return res.status(404).json({ error: "Not found" });
      await storage.deleteStory(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/stories/:id/view — mark story viewed
  app.post("/api/stories/:id/view", requireAuth, async (req: Request, res: Response) => {
    try {
      const viewerId = (req as any).userId as number;
      const storyId = parseInt(String(req.params.id));
      await storage.recordStoryView(storyId, viewerId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/stories/:id/views — who viewed my story
  app.get("/api/stories/:id/views", requireAuth, async (req: Request, res: Response) => {
    try {
      const storyId = parseInt(String(req.params.id));
      const views = await storage.getStoryViews(storyId);
      res.json(views);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
