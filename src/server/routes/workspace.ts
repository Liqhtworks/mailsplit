import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../db";
import { users, workspaces } from "../db/schema";
import { nanoid } from "nanoid";
import { requireAuth, requireRole } from "../auth";

const app = new Hono();

app.use("*", requireAuth);

// Get current workspace
app.get("/", async (c) => {
  const workspaceId = c.get("workspaceId");
  if (!workspaceId) return c.json({ error: "No workspace" }, 404);

  const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  const members = await db.query.users.findMany({ where: eq(users.workspaceId, workspaceId) });

  return c.json({
    data: {
      ...workspace,
      members: members.map((m) => ({ id: m.id, email: m.email, name: m.name, role: m.role })),
    },
  });
});

// Update workspace
app.patch("/", requireRole("owner", "admin"), async (c) => {
  const workspaceId = c.get("workspaceId");
  const body = await c.req.json();

  if (body.name) {
    await db.update(workspaces).set({ name: body.name }).where(eq(workspaces.id, workspaceId));
  }

  const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  return c.json({ data: workspace });
});

// Invite user
app.post("/invite", requireRole("owner", "admin"), async (c) => {
  const { email, role } = await c.req.json();
  if (!email) return c.json({ error: "Email required" }, 400);

  const validRoles = ["admin", "editor", "viewer"];
  const assignRole = validRoles.includes(role) ? role : "editor";

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return c.json({ error: "User already exists" }, 409);

  const userId = nanoid(10);
  const workspaceId = c.get("workspaceId");
  const now = new Date().toISOString();

  // Create invitation token
  const token = nanoid(32);
  sqlite.exec(
    `INSERT INTO invitations (token, email, role, workspace_id, invited_by, created_at, expires_at) VALUES ('${token}', '${email}', '${assignRole}', '${workspaceId}', '${c.get("user").id}', '${now}', '${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()}')`
  );

  // In production: send invitation email
  console.log(`[Invite] ${email} invited as ${assignRole} with token: ${token}`);

  return c.json({ data: { email, role: assignRole, token } }, 201);
});

// Accept invitation
app.post("/accept-invite", async (c) => {
  const { token, password, name } = await c.req.json();
  const invite = sqlite.query(
    "SELECT * FROM invitations WHERE token = ? AND expires_at > ? AND accepted_at IS NULL"
  ).get(token, new Date().toISOString()) as any;

  if (!invite) return c.json({ error: "Invalid or expired invitation" }, 400);

  const userId = nanoid(10);
  const now = new Date().toISOString();

  // Hash password if provided
  let passwordHash = null;
  if (password) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const hash = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      256
    );
    passwordHash = Buffer.from(salt).toString("hex") + ":" + Buffer.from(hash).toString("hex");
  }

  await db.insert(users).values({
    id: userId,
    email: invite.email,
    passwordHash,
    name: name || invite.email.split("@")[0],
    role: invite.role,
    workspaceId: invite.workspace_id,
    createdAt: now,
  });

  sqlite.exec(`UPDATE invitations SET accepted_at = '${now}' WHERE token = '${token}'`);

  return c.json({ data: { userId, email: invite.email, role: invite.role } }, 201);
});

// Update member role
app.patch("/members/:userId", requireRole("owner", "admin"), async (c) => {
  const targetId = c.req.param("userId");
  const { role } = await c.req.json();
  const currentUser = c.get("user");
  const workspaceId = c.get("workspaceId");

  const target = await db.query.users.findFirst({ where: eq(users.id, targetId) });
  if (!target || target.workspaceId !== workspaceId) return c.json({ error: "User not found" }, 404);

  // Can't change own role
  if (targetId === currentUser.id) return c.json({ error: "Cannot change your own role" }, 400);

  // Only owner can promote to admin
  if (role === "admin" && currentUser.role !== "owner") {
    return c.json({ error: "Only owners can promote to admin" }, 403);
  }

  // Can't demote owner
  if (target.role === "owner") return c.json({ error: "Cannot change owner role" }, 403);

  const validRoles = ["admin", "editor", "viewer"];
  if (!validRoles.includes(role)) return c.json({ error: "Invalid role" }, 400);

  await db.update(users).set({ role }).where(eq(users.id, targetId));
  return c.json({ data: { userId: targetId, role } });
});

// Remove member
app.delete("/members/:userId", requireRole("owner", "admin"), async (c) => {
  const targetId = c.req.param("userId");
  const currentUser = c.get("user");
  const workspaceId = c.get("workspaceId");

  const target = await db.query.users.findFirst({ where: eq(users.id, targetId) });
  if (!target || target.workspaceId !== workspaceId) return c.json({ error: "User not found" }, 404);
  if (target.role === "owner") return c.json({ error: "Cannot remove workspace owner" }, 403);
  if (targetId === currentUser.id) return c.json({ error: "Cannot remove yourself" }, 400);

  // Delete sessions
  sqlite.exec(`DELETE FROM sessions WHERE user_id = '${targetId}'`);
  await db.delete(users).where(eq(users.id, targetId));

  return c.json({ data: { removed: true } });
});

// Delete workspace (owner only)
app.delete("/", requireRole("owner"), async (c) => {
  const workspaceId = c.get("workspaceId");

  // Clean up all workspace data
  sqlite.exec(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE workspace_id = '${workspaceId}')`);
  sqlite.exec(`DELETE FROM events WHERE variant_id IN (SELECT v.id FROM variants v JOIN tests t ON v.test_id = t.id WHERE t.workspace_id = '${workspaceId}')`);
  sqlite.exec(`DELETE FROM variants WHERE test_id IN (SELECT id FROM tests WHERE workspace_id = '${workspaceId}')`);
  sqlite.exec(`DELETE FROM tests WHERE workspace_id = '${workspaceId}'`);
  sqlite.exec(`DELETE FROM recipients WHERE workspace_id = '${workspaceId}'`);
  sqlite.exec(`DELETE FROM users WHERE workspace_id = '${workspaceId}'`);
  sqlite.exec(`DELETE FROM workspaces WHERE id = '${workspaceId}'`);

  return c.json({ data: { deleted: true } });
});

export default app;
