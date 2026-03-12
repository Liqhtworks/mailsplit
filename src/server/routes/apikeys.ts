import { Hono } from "hono";
import { nanoid } from "nanoid";
import { sqlite } from "../db";
import { requireAuth } from "../auth";

const app = new Hono();

app.use("*", requireAuth);

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(key));
  return Buffer.from(hash).toString("hex");
}

// List API keys
app.get("/", async (c) => {
  const user = c.get("user");
  const keys = sqlite.query(
    "SELECT id, name, prefix, created_at, last_used_at, revoked_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC"
  ).all(user.id);
  return c.json({ data: keys });
});

// Create API key
app.post("/", async (c) => {
  const user = c.get("user");
  const { name } = await c.req.json();
  if (!name) return c.json({ error: "Name required" }, 400);

  const id = nanoid(10);
  const rawKey = `ms_${nanoid(40)}`;
  const prefix = rawKey.slice(0, 10) + "...";
  const keyHash = await hashKey(rawKey);
  const now = new Date().toISOString();

  sqlite.exec(
    `INSERT INTO api_keys (id, user_id, workspace_id, name, key_hash, prefix, created_at) VALUES ('${id}', '${user.id}', '${user.workspaceId}', '${name.replace(/'/g, "''")}', '${keyHash}', '${prefix}', '${now}')`
  );

  // Return the raw key ONCE - it can never be retrieved again
  return c.json({ data: { id, name, key: rawKey, prefix, createdAt: now } }, 201);
});

// Revoke API key
app.delete("/:id", async (c) => {
  const user = c.get("user");
  const keyId = c.req.param("id");

  const key = sqlite.query("SELECT * FROM api_keys WHERE id = ? AND user_id = ?").get(keyId, user.id) as any;
  if (!key) return c.json({ error: "API key not found" }, 404);
  if (key.revoked_at) return c.json({ error: "Already revoked" }, 400);

  sqlite.exec(`UPDATE api_keys SET revoked_at = '${new Date().toISOString()}' WHERE id = '${keyId}'`);
  return c.json({ data: { revoked: true } });
});

export default app;
