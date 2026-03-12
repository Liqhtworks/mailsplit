import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { db, sqlite } from "./db";
import { users, sessions, workspaces } from "./db/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Context, Next } from "hono";

// Simple password hashing using Web Crypto (no bcrypt dependency needed)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const saltHex = Buffer.from(salt).toString("hex");
  const hashHex = Buffer.from(hash).toString("hex");
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return Buffer.from(hash).toString("hex") === hashHex;
}

function createSession(userId: string): string {
  const sessionId = nanoid(32);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  sqlite.exec(`INSERT INTO sessions (id, user_id, expires_at) VALUES ('${sessionId}', '${userId}', '${expiresAt}')`);
  return sessionId;
}

// Auth middleware - sets c.set("user", ...) if authenticated
export async function authMiddleware(c: Context, next: Next) {
  const sessionId = getCookie(c, "session");
  const apiKey = c.req.header("Authorization")?.replace("Bearer ", "");

  if (sessionId) {
    const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
    if (session && new Date(session.expiresAt) > new Date()) {
      const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
      if (user) {
        c.set("user", user);
        c.set("workspaceId", user.workspaceId);
      }
    }
  } else if (apiKey) {
    // API key auth handled in apikey routes
    const apiKeyRow = sqlite.query("SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL").get(
      await hashApiKey(apiKey)
    ) as any;
    if (apiKeyRow) {
      const user = await db.query.users.findFirst({ where: eq(users.id, apiKeyRow.user_id) });
      if (user) {
        c.set("user", user);
        c.set("workspaceId", user.workspaceId);
        sqlite.exec(`UPDATE api_keys SET last_used_at = '${new Date().toISOString()}' WHERE id = '${apiKeyRow.id}'`);
      }
    }
  }

  await next();
}

async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(key));
  return Buffer.from(hash).toString("hex");
}

// Require auth - returns 401 if not authenticated
export async function requireAuth(c: Context, next: Next) {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  await next();
}

// Role check middleware factory
export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (!roles.includes(user.role)) return c.json({ error: "Forbidden" }, 403);
    await next();
  };
}

// Auth routes
const authRoutes = new Hono();

// Register
authRoutes.post("/register", async (c) => {
  const { email, password, name, workspaceName } = await c.req.json();
  if (!email || !password) return c.json({ error: "Email and password required" }, 400);

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return c.json({ error: "Email already registered" }, 409);

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  const wsId = nanoid(10);
  const userId = nanoid(10);

  // Create workspace
  await db.insert(workspaces).values({
    id: wsId,
    name: workspaceName || `${name || email}'s Workspace`,
    createdAt: now,
  });

  // Create user as owner
  await db.insert(users).values({
    id: userId,
    email,
    passwordHash,
    name: name || email.split("@")[0],
    role: "owner",
    workspaceId: wsId,
    createdAt: now,
  });

  const sessionId = createSession(userId);
  setCookie(c, "session", sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  return c.json({ data: { userId, workspaceId: wsId, email } }, 201);
});

// Login
authRoutes.post("/login", async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) return c.json({ error: "Email and password required" }, 400);

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !user.passwordHash) return c.json({ error: "Invalid credentials" }, 401);

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return c.json({ error: "Invalid credentials" }, 401);

  const sessionId = createSession(user.id);
  setCookie(c, "session", sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  return c.json({ data: { userId: user.id, email: user.email, role: user.role, workspaceId: user.workspaceId } });
});

// Magic link request
authRoutes.post("/magic-link", async (c) => {
  const { email } = await c.req.json();
  if (!email) return c.json({ error: "Email required" }, 400);

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) return c.json({ data: { sent: true } }); // Don't reveal if user exists

  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min
  sqlite.exec(`INSERT OR REPLACE INTO magic_links (token, user_id, expires_at) VALUES ('${token}', '${user.id}', '${expiresAt}')`);

  // In production: send email with link containing token
  console.log(`[MagicLink] Token for ${email}: ${token}`);
  return c.json({ data: { sent: true, token } }); // token returned for dev only
});

// Magic link verify
authRoutes.post("/magic-link/verify", async (c) => {
  const { token } = await c.req.json();
  const row = sqlite.query("SELECT * FROM magic_links WHERE token = ? AND expires_at > ?").get(
    token,
    new Date().toISOString()
  ) as any;

  if (!row) return c.json({ error: "Invalid or expired token" }, 401);

  sqlite.exec(`DELETE FROM magic_links WHERE token = '${token}'`);
  const sessionId = createSession(row.user_id);
  setCookie(c, "session", sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  const user = await db.query.users.findFirst({ where: eq(users.id, row.user_id) });
  return c.json({ data: { userId: user!.id, email: user!.email } });
});

// Logout
authRoutes.post("/logout", async (c) => {
  const sessionId = getCookie(c, "session");
  if (sessionId) {
    sqlite.exec(`DELETE FROM sessions WHERE id = '${sessionId}'`);
    deleteCookie(c, "session");
  }
  return c.json({ data: { loggedOut: true } });
});

// Get current user
authRoutes.get("/me", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  return c.json({
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      workspaceId: user.workspaceId,
    },
  });
});

export { authRoutes, hashApiKey };
