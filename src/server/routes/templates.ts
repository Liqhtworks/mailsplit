import { Hono } from "hono";
import { sqlite } from "../db";
import { nanoid } from "nanoid";
import { requireAuth } from "../auth";

const app = new Hono();

// List templates
app.get("/", async (c) => {
  const workspaceId = c.req.query("workspaceId") || "";
  const category = c.req.query("category");
  const search = c.req.query("search");

  let query = "SELECT * FROM templates WHERE (workspace_id = ? OR workspace_id = 'system')";
  const params: string[] = [workspaceId];

  if (category) {
    query += " AND category = ?";
    params.push(category);
  }
  if (search) {
    query += " AND (name LIKE ? OR category LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  query += " ORDER BY created_at DESC";
  const templates = sqlite.query(query).all(...params);
  return c.json({ data: templates });
});

// Get template
app.get("/:id", async (c) => {
  const template = sqlite.query("SELECT * FROM templates WHERE id = ?").get(c.req.param("id"));
  if (!template) return c.json({ error: "Template not found" }, 404);
  return c.json({ data: template });
});

// Create template
app.post("/", requireAuth, async (c) => {
  const body = await c.req.json();
  const id = nanoid(10);
  const now = new Date().toISOString();

  sqlite.exec(
    `INSERT INTO templates (id, name, category, subject, preheader, body_html, workspace_id, created_by, created_at, updated_at)
     VALUES ('${id}', '${(body.name || "Untitled").replace(/'/g, "''")}', '${(body.category || "general").replace(/'/g, "''")}', '${(body.subject || "").replace(/'/g, "''")}', '${(body.preheader || "").replace(/'/g, "''")}', '${(body.bodyHtml || "").replace(/'/g, "''")}', '${body.workspaceId || c.get("workspaceId") || ""}', '${c.get("user")?.id || ""}', '${now}', '${now}')`
  );

  return c.json({ data: { id, name: body.name, category: body.category } }, 201);
});

// Update template
app.patch("/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const updates: string[] = [`updated_at = '${new Date().toISOString()}'`];

  if (body.name !== undefined) updates.push(`name = '${body.name.replace(/'/g, "''")}'`);
  if (body.category !== undefined) updates.push(`category = '${body.category.replace(/'/g, "''")}'`);
  if (body.subject !== undefined) updates.push(`subject = '${body.subject.replace(/'/g, "''")}'`);
  if (body.preheader !== undefined) updates.push(`preheader = '${body.preheader.replace(/'/g, "''")}'`);
  if (body.bodyHtml !== undefined) updates.push(`body_html = '${body.bodyHtml.replace(/'/g, "''")}'`);

  sqlite.exec(`UPDATE templates SET ${updates.join(", ")} WHERE id = '${id}'`);
  const updated = sqlite.query("SELECT * FROM templates WHERE id = ?").get(id);
  return c.json({ data: updated });
});

// Delete template
app.delete("/:id", requireAuth, async (c) => {
  sqlite.exec(`DELETE FROM templates WHERE id = '${c.req.param("id")}'`);
  return c.json({ data: { deleted: true } });
});

export default app;
