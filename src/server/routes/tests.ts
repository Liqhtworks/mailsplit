import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tests, variants, events } from "../db/schema";
import { nanoid } from "nanoid";
import { compareVariants } from "../stats";
import type { TestStatus, VariantMetrics } from "../../shared/types";

const app = new Hono();

function computeMetrics(variantEvents: { type: string }[], sent: number): VariantMetrics {
  const opens = variantEvents.filter((e) => e.type === "open").length;
  const clicks = variantEvents.filter((e) => e.type === "click").length;
  const bounces = variantEvents.filter((e) => e.type === "bounce").length;
  const unsubscribes = variantEvents.filter((e) => e.type === "unsubscribe").length;
  const replies = variantEvents.filter((e) => e.type === "reply").length;
  return {
    sent,
    opens,
    clicks,
    bounces,
    unsubscribes,
    replies,
    openRate: sent > 0 ? opens / sent : 0,
    clickRate: sent > 0 ? clicks / sent : 0,
    bounceRate: sent > 0 ? bounces / sent : 0,
  };
}

// List tests
app.get("/", async (c) => {
  const allTests = await db.query.tests.findMany({
    with: { variants: true },
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  return c.json({ data: allTests });
});

// Get test with full metrics
app.get("/:id", async (c) => {
  const test = await db.query.tests.findFirst({
    where: eq(tests.id, c.req.param("id")),
    with: { variants: true },
  });
  if (!test) return c.json({ error: "Test not found" }, 404);

  const variantsWithMetrics = await Promise.all(
    test.variants.map(async (v) => {
      const variantEvents = await db.query.events.findMany({
        where: eq(events.variantId, v.id),
      });
      const sent = variantEvents.filter((e) => e.type === "send").length;
      return { ...v, metrics: computeMetrics(variantEvents, sent) };
    })
  );

  // Compute statistical comparisons
  let stats = null;
  if (variantsWithMetrics.length >= 2) {
    const a = variantsWithMetrics[0];
    const b = variantsWithMetrics[1];
    stats = compareVariants(
      a.id,
      b.id,
      { sent: a.metrics.sent, opens: a.metrics.opens, clicks: a.metrics.clicks },
      { sent: b.metrics.sent, opens: b.metrics.opens, clicks: b.metrics.clicks }
    );
  }

  return c.json({
    data: {
      ...test,
      trafficSplit: JSON.parse(test.trafficSplit || "[]"),
      variants: variantsWithMetrics,
      stats,
    },
  });
});

// Create test
app.post("/", async (c) => {
  const body = await c.req.json();
  const id = nanoid(10);
  const now = new Date().toISOString();

  await db.insert(tests).values({
    id,
    name: body.name || "Untitled Test",
    status: "draft",
    audienceSegment: body.audienceSegment || null,
    trafficSplit: JSON.stringify(body.trafficSplit || [50, 50]),
    scheduledAt: body.scheduledAt || null,
    workspaceId: body.workspaceId || null,
    createdAt: now,
    updatedAt: now,
  });

  const test = await db.query.tests.findFirst({ where: eq(tests.id, id) });
  return c.json({ data: test }, 201);
});

// Update test
app.patch("/:id", async (c) => {
  const test = await db.query.tests.findFirst({
    where: eq(tests.id, c.req.param("id")),
  });
  if (!test) return c.json({ error: "Test not found" }, 404);

  const body = await c.req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (body.name !== undefined) updates.name = body.name;
  if (body.status !== undefined) updates.status = body.status;
  if (body.trafficSplit !== undefined) updates.trafficSplit = JSON.stringify(body.trafficSplit);
  if (body.scheduledAt !== undefined) updates.scheduledAt = body.scheduledAt;

  await db.update(tests).set(updates).where(eq(tests.id, c.req.param("id")));
  const updated = await db.query.tests.findFirst({ where: eq(tests.id, c.req.param("id")) });
  return c.json({ data: updated });
});

// Delete test
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const test = await db.query.tests.findFirst({ where: eq(tests.id, id) });
  if (!test) return c.json({ error: "Test not found" }, 404);

  // Delete events for all variants
  const testVariants = await db.query.variants.findMany({ where: eq(variants.testId, id) });
  for (const v of testVariants) {
    await db.delete(events).where(eq(events.variantId, v.id));
  }
  await db.delete(variants).where(eq(variants.testId, id));
  await db.delete(tests).where(eq(tests.id, id));

  return c.json({ data: { deleted: true } });
});

// Add variant
app.post("/:id/variants", async (c) => {
  const testId = c.req.param("id");
  const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) });
  if (!test) return c.json({ error: "Test not found" }, 404);

  const existingVariants = await db.query.variants.findMany({
    where: eq(variants.testId, testId),
  });
  if (existingVariants.length >= 5) {
    return c.json({ error: "Maximum 5 variants per test" }, 400);
  }

  const body = await c.req.json();
  const id = nanoid(10);

  await db.insert(variants).values({
    id,
    testId,
    label: body.label || `Variant ${String.fromCharCode(65 + existingVariants.length)}`,
    subject: body.subject || "",
    preheader: body.preheader || "",
    bodyHtml: body.bodyHtml || "",
    createdAt: new Date().toISOString(),
  });

  const variant = await db.query.variants.findFirst({ where: eq(variants.id, id) });
  return c.json({ data: variant }, 201);
});

// Update variant
app.patch("/:testId/variants/:variantId", async (c) => {
  const variant = await db.query.variants.findFirst({
    where: eq(variants.id, c.req.param("variantId")),
  });
  if (!variant) return c.json({ error: "Variant not found" }, 404);

  const body = await c.req.json();
  const updates: Record<string, unknown> = {};
  if (body.label !== undefined) updates.label = body.label;
  if (body.subject !== undefined) updates.subject = body.subject;
  if (body.preheader !== undefined) updates.preheader = body.preheader;
  if (body.bodyHtml !== undefined) updates.bodyHtml = body.bodyHtml;

  await db.update(variants).set(updates).where(eq(variants.id, c.req.param("variantId")));
  const updated = await db.query.variants.findFirst({
    where: eq(variants.id, c.req.param("variantId")),
  });
  return c.json({ data: updated });
});

// Delete variant
app.delete("/:testId/variants/:variantId", async (c) => {
  const variantId = c.req.param("variantId");
  await db.delete(events).where(eq(events.variantId, variantId));
  await db.delete(variants).where(eq(variants.id, variantId));
  return c.json({ data: { deleted: true } });
});

// Start test (simulate dispatch)
app.post("/:id/start", async (c) => {
  const test = await db.query.tests.findFirst({
    where: eq(tests.id, c.req.param("id")),
    with: { variants: true },
  });
  if (!test) return c.json({ error: "Test not found" }, 404);
  if (test.variants.length < 2) return c.json({ error: "Need at least 2 variants" }, 400);

  await db
    .update(tests)
    .set({ status: "running", updatedAt: new Date().toISOString() })
    .where(eq(tests.id, c.req.param("id")));

  // Simulate sending + events for demo
  const split = JSON.parse(test.trafficSplit || "[50,50]") as number[];
  const totalAudience = 1000;

  for (let i = 0; i < test.variants.length; i++) {
    const variant = test.variants[i];
    const count = Math.floor((totalAudience * (split[i] || 50)) / 100);

    // Simulate sends
    for (let j = 0; j < count; j++) {
      await db.insert(events).values({
        id: nanoid(10),
        variantId: variant.id,
        type: "send",
        timestamp: new Date().toISOString(),
      });
    }

    // Simulate opens (random rate between 15-35%)
    const openRate = 0.15 + Math.random() * 0.2;
    const opens = Math.floor(count * openRate);
    for (let j = 0; j < opens; j++) {
      await db.insert(events).values({
        id: nanoid(10),
        variantId: variant.id,
        type: "open",
        timestamp: new Date(Date.now() + Math.random() * 3600000).toISOString(),
      });
    }

    // Simulate clicks (random rate between 2-8%)
    const clickRate = 0.02 + Math.random() * 0.06;
    const clicks = Math.floor(count * clickRate);
    for (let j = 0; j < clicks; j++) {
      await db.insert(events).values({
        id: nanoid(10),
        variantId: variant.id,
        type: "click",
        timestamp: new Date(Date.now() + Math.random() * 7200000).toISOString(),
      });
    }

    // Simulate bounces (1-3%)
    const bounceRate = 0.01 + Math.random() * 0.02;
    const bounces = Math.floor(count * bounceRate);
    for (let j = 0; j < bounces; j++) {
      await db.insert(events).values({
        id: nanoid(10),
        variantId: variant.id,
        type: "bounce",
        timestamp: new Date().toISOString(),
      });
    }
  }

  return c.json({ data: { status: "running", audienceSize: totalAudience } });
});

// Declare winner
app.post("/:id/declare-winner", async (c) => {
  const body = await c.req.json();
  await db
    .update(tests)
    .set({ status: "completed", updatedAt: new Date().toISOString() })
    .where(eq(tests.id, c.req.param("id")));
  return c.json({ data: { winnerId: body.variantId, status: "completed" } });
});

// Analytics endpoint
app.get("/:id/analytics", async (c) => {
  const test = await db.query.tests.findFirst({
    where: eq(tests.id, c.req.param("id")),
    with: { variants: true },
  });
  if (!test) return c.json({ error: "Test not found" }, 404);

  const analytics = await Promise.all(
    test.variants.map(async (v) => {
      const variantEvents = await db.query.events.findMany({
        where: eq(events.variantId, v.id),
      });
      const sent = variantEvents.filter((e) => e.type === "send").length;
      return {
        variantId: v.id,
        label: v.label,
        subject: v.subject,
        metrics: computeMetrics(variantEvents, sent),
      };
    })
  );

  return c.json({ data: analytics });
});

export default app;
