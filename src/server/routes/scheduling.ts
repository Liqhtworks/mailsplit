import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../db";
import { tests } from "../db/schema";

const app = new Hono();

// Internal scheduler - checks for tests that need to start
const scheduledTimers = new Map<string, Timer>();

// Schedule a test for future execution
app.post("/:id/schedule", async (c) => {
  const testId = c.req.param("id");
  const test = await db.query.tests.findFirst({ where: eq(tests.id, testId), with: { variants: true } });
  if (!test) return c.json({ error: "Test not found" }, 404);
  if (test.status !== "draft") return c.json({ error: "Only draft tests can be scheduled" }, 400);
  if (test.variants.length < 2) return c.json({ error: "Need at least 2 variants" }, 400);

  const { scheduledAt, timezone, recurring } = await c.req.json();
  if (!scheduledAt) return c.json({ error: "scheduledAt required" }, 400);

  const scheduleTime = new Date(scheduledAt);
  if (scheduleTime <= new Date()) return c.json({ error: "Schedule time must be in the future" }, 400);

  // Update test
  await db.update(tests).set({
    status: "scheduled",
    scheduledAt: scheduleTime.toISOString(),
    updatedAt: new Date().toISOString(),
  }).where(eq(tests.id, testId));

  // Store schedule metadata
  sqlite.exec(
    `INSERT OR REPLACE INTO schedules (test_id, scheduled_at, timezone, recurring, created_at) VALUES ('${testId}', '${scheduleTime.toISOString()}', '${timezone || "UTC"}', '${recurring || ""}', '${new Date().toISOString()}')`
  );

  // Set timer for execution
  const delay = scheduleTime.getTime() - Date.now();
  if (delay > 0 && delay < 2147483647) { // Max setTimeout
    const timer = setTimeout(() => executeScheduledTest(testId), delay);
    scheduledTimers.set(testId, timer);
  }

  return c.json({
    data: {
      testId,
      scheduledAt: scheduleTime.toISOString(),
      timezone: timezone || "UTC",
      recurring: recurring || null,
    },
  });
});

// Cancel a scheduled test
app.post("/:id/cancel-schedule", async (c) => {
  const testId = c.req.param("id");
  const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) });
  if (!test) return c.json({ error: "Test not found" }, 404);
  if (test.status !== "scheduled") return c.json({ error: "Test is not scheduled" }, 400);

  const timer = scheduledTimers.get(testId);
  if (timer) {
    clearTimeout(timer);
    scheduledTimers.delete(testId);
  }

  await db.update(tests).set({
    status: "draft",
    scheduledAt: null,
    updatedAt: new Date().toISOString(),
  }).where(eq(tests.id, testId));

  sqlite.exec(`DELETE FROM schedules WHERE test_id = '${testId}'`);

  return c.json({ data: { cancelled: true } });
});

// Get schedule info
app.get("/:id/schedule", async (c) => {
  const testId = c.req.param("id");
  const schedule = sqlite.query("SELECT * FROM schedules WHERE test_id = ?").get(testId) as any;
  if (!schedule) return c.json({ error: "No schedule found" }, 404);

  const now = new Date();
  const scheduledAt = new Date(schedule.scheduled_at);
  const msRemaining = scheduledAt.getTime() - now.getTime();

  return c.json({
    data: {
      testId: schedule.test_id,
      scheduledAt: schedule.scheduled_at,
      timezone: schedule.timezone,
      recurring: schedule.recurring || null,
      countdown: msRemaining > 0 ? {
        hours: Math.floor(msRemaining / 3600000),
        minutes: Math.floor((msRemaining % 3600000) / 60000),
      } : null,
    },
  });
});

// List all scheduled tests
app.get("/", async (c) => {
  const schedules = sqlite.query(
    "SELECT s.*, t.name as test_name, t.status FROM schedules s JOIN tests t ON s.test_id = t.id ORDER BY s.scheduled_at ASC"
  ).all();
  return c.json({ data: schedules });
});

async function executeScheduledTest(testId: string) {
  console.log(`[Scheduler] Executing scheduled test ${testId}`);
  scheduledTimers.delete(testId);

  const test = await db.query.tests.findFirst({ where: eq(tests.id, testId), with: { variants: true } });
  if (!test || test.status !== "scheduled") return;

  // Trigger the start - reuse the same dispatch logic from tests route
  await db.update(tests).set({
    status: "running",
    updatedAt: new Date().toISOString(),
  }).where(eq(tests.id, testId));

  // Check for recurring schedule
  const schedule = sqlite.query("SELECT * FROM schedules WHERE test_id = ?").get(testId) as any;
  if (schedule?.recurring) {
    console.log(`[Scheduler] Recurring test ${testId} - next run based on: ${schedule.recurring}`);
    // For recurring: create a new test instance and schedule it
  }
}

// On startup: restore scheduled timers
export function restoreSchedules() {
  const schedules = sqlite.query(
    "SELECT * FROM schedules WHERE scheduled_at > ?"
  ).all(new Date().toISOString()) as any[];

  for (const s of schedules) {
    const delay = new Date(s.scheduled_at).getTime() - Date.now();
    if (delay > 0 && delay < 2147483647) {
      const timer = setTimeout(() => executeScheduledTest(s.test_id), delay);
      scheduledTimers.set(s.test_id, timer);
      console.log(`[Scheduler] Restored timer for ${s.test_id}, fires in ${Math.round(delay / 60000)}min`);
    }
  }
}

export default app;
