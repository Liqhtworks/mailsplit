import { Hono } from "hono";
import { eq, and, like, sql } from "drizzle-orm";
import { db, sqlite } from "../db";
import { recipients } from "../db/schema";
import { nanoid } from "nanoid";

const app = new Hono();

interface FilterCondition {
  field: string; // "tag", "property.<name>", "engagement.<type>"
  operator: string; // "includes", "excludes", "equals", "contains", "gt", "lt"
  value: string;
}

interface SegmentFilter {
  logic: "and" | "or";
  conditions: FilterCondition[];
}

// List saved segments
app.get("/", async (c) => {
  const rows = sqlite.query("SELECT * FROM segments ORDER BY created_at DESC").all();
  return c.json({ data: rows });
});

// Create segment
app.post("/", async (c) => {
  const body = await c.req.json();
  const id = nanoid(10);
  const now = new Date().toISOString();
  sqlite.exec(
    `INSERT INTO segments (id, name, filters, workspace_id, created_at) VALUES ('${id}', '${(body.name || "Untitled").replace(/'/g, "''")}', '${JSON.stringify(body.filters || { logic: "and", conditions: [] })}', '${body.workspaceId || ""}', '${now}')`
  );
  return c.json({ data: { id, name: body.name, filters: body.filters } }, 201);
});

// Preview segment (count + sample)
app.post("/preview", async (c) => {
  const body = await c.req.json();
  const filters = body.filters as SegmentFilter;
  const workspaceId = body.workspaceId || "";

  let allRecipients = await db.query.recipients.findMany({
    where: workspaceId ? eq(recipients.workspaceId, workspaceId) : undefined,
  });

  if (filters && filters.conditions.length > 0) {
    allRecipients = allRecipients.filter((r) => {
      const results = filters.conditions.map((cond) => evaluateCondition(r, cond));
      return filters.logic === "and" ? results.every(Boolean) : results.some(Boolean);
    });
  }

  return c.json({
    data: {
      count: allRecipients.length,
      sample: allRecipients.slice(0, 10).map((r) => ({
        id: r.id,
        email: r.email,
        tags: JSON.parse(r.tags || "[]"),
        properties: JSON.parse(r.properties || "{}"),
      })),
    },
  });
});

// Import recipients via CSV-like JSON array (MUST be before /:id routes)
app.post("/recipients/import", async (c) => {
  const body = await c.req.json();
  const rows = body.recipients as { email: string; tags?: string[]; properties?: Record<string, string> }[];
  const workspaceId = body.workspaceId || "";

  let imported = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = sqlite.query("SELECT id FROM recipients WHERE email = ? AND workspace_id = ?").get(
      row.email,
      workspaceId
    ) as any;

    if (existing) {
      const updateStmt = sqlite.prepare("UPDATE recipients SET tags = ?, properties = ? WHERE id = ?");
      updateStmt.run(JSON.stringify(row.tags || []), JSON.stringify(row.properties || {}), existing.id);
      updated++;
    } else {
      const id = nanoid(10);
      await db.insert(recipients).values({
        id,
        email: row.email,
        tags: JSON.stringify(row.tags || []),
        properties: JSON.stringify(row.properties || {}),
        workspaceId: workspaceId || null,
        createdAt: new Date().toISOString(),
      });
      imported++;
    }
  }

  return c.json({ data: { imported, updated, total: rows.length } });
});

// Delete segment
app.delete("/:id", async (c) => {
  sqlite.exec(`DELETE FROM segments WHERE id = '${c.req.param("id")}'`);
  return c.json({ data: { deleted: true } });
});

function evaluateCondition(recipient: any, cond: FilterCondition): boolean {
  if (cond.field === "tag") {
    const tags = JSON.parse(recipient.tags || "[]") as string[];
    if (cond.operator === "includes") return tags.includes(cond.value);
    if (cond.operator === "excludes") return !tags.includes(cond.value);
    return false;
  }

  if (cond.field.startsWith("property.")) {
    const propName = cond.field.split(".")[1];
    const props = JSON.parse(recipient.properties || "{}");
    const val = props[propName];
    if (val === undefined) return false;

    switch (cond.operator) {
      case "equals": return String(val) === cond.value;
      case "contains": return String(val).includes(cond.value);
      case "gt": return Number(val) > Number(cond.value);
      case "lt": return Number(val) < Number(cond.value);
      default: return false;
    }
  }

  return true;
}

export default app;
