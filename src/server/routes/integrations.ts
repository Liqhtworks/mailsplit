import { Hono } from "hono";
import { sqlite } from "../db";
import { nanoid } from "nanoid";
import { requireAuth } from "../auth";

const app = new Hono();

// ===================== SLACK =====================

// Connect Slack (store webhook URL)
app.post("/slack/connect", requireAuth, async (c) => {
  const { webhookUrl, channel } = await c.req.json();
  if (!webhookUrl) return c.json({ error: "webhookUrl required" }, 400);

  const workspaceId = c.get("workspaceId") || "";
  const now = new Date().toISOString();

  sqlite.exec(
    `INSERT OR REPLACE INTO slack_config (workspace_id, webhook_url, channel, notify_start, notify_significance, notify_winner, notify_complete, notify_error, connected_at)
     VALUES ('${workspaceId}', '${webhookUrl}', '${channel || "#general"}', 1, 1, 1, 1, 1, '${now}')`
  );

  return c.json({ data: { connected: true, channel } });
});

// Update Slack notification preferences
app.patch("/slack/preferences", requireAuth, async (c) => {
  const body = await c.req.json();
  const workspaceId = c.get("workspaceId") || "";
  const updates: string[] = [];

  if (body.notifyStart !== undefined) updates.push(`notify_start = ${body.notifyStart ? 1 : 0}`);
  if (body.notifySignificance !== undefined) updates.push(`notify_significance = ${body.notifySignificance ? 1 : 0}`);
  if (body.notifyWinner !== undefined) updates.push(`notify_winner = ${body.notifyWinner ? 1 : 0}`);
  if (body.notifyComplete !== undefined) updates.push(`notify_complete = ${body.notifyComplete ? 1 : 0}`);
  if (body.notifyError !== undefined) updates.push(`notify_error = ${body.notifyError ? 1 : 0}`);

  if (updates.length > 0) {
    sqlite.exec(`UPDATE slack_config SET ${updates.join(", ")} WHERE workspace_id = '${workspaceId}'`);
  }

  const config = sqlite.query("SELECT * FROM slack_config WHERE workspace_id = ?").get(workspaceId);
  return c.json({ data: config });
});

// Disconnect Slack
app.delete("/slack", requireAuth, async (c) => {
  const workspaceId = c.get("workspaceId") || "";
  sqlite.exec(`DELETE FROM slack_config WHERE workspace_id = '${workspaceId}'`);
  return c.json({ data: { disconnected: true } });
});

// Get Slack config
app.get("/slack", requireAuth, async (c) => {
  const workspaceId = c.get("workspaceId") || "";
  const config = sqlite.query("SELECT * FROM slack_config WHERE workspace_id = ?").get(workspaceId);
  return c.json({ data: config || null });
});

// Send Slack notification (internal helper)
export async function sendSlackNotification(workspaceId: string, event: string, message: string, testUrl?: string) {
  const config = sqlite.query("SELECT * FROM slack_config WHERE workspace_id = ?").get(workspaceId) as any;
  if (!config) return;

  const eventMap: Record<string, string> = {
    start: "notify_start",
    significance: "notify_significance",
    winner: "notify_winner",
    complete: "notify_complete",
    error: "notify_error",
  };

  if (eventMap[event] && !config[eventMap[event]]) return;

  const payload = {
    text: message,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: message } },
      ...(testUrl
        ? [{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "View Dashboard" }, url: testUrl }] }]
        : []),
    ],
  };

  try {
    await fetch(config.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`[Slack] Failed to send notification: ${err}`);
  }
}

// ===================== ZAPIER =====================

// Zapier webhook subscriptions
app.post("/zapier/subscribe", async (c) => {
  const { hookUrl, event } = await c.req.json();
  if (!hookUrl || !event) return c.json({ error: "hookUrl and event required" }, 400);

  const validEvents = ["test_completed", "winner_declared", "test_started"];
  if (!validEvents.includes(event)) return c.json({ error: `Invalid event. Valid: ${validEvents.join(", ")}` }, 400);

  const id = nanoid(10);
  const apiKey = c.req.header("Authorization")?.replace("Bearer ", "") || "";

  sqlite.exec(
    `INSERT INTO zapier_subscriptions (id, hook_url, event, api_key, created_at)
     VALUES ('${id}', '${hookUrl}', '${event}', '${apiKey}', '${new Date().toISOString()}')`
  );

  return c.json({ data: { id } }, 201);
});

// Unsubscribe
app.delete("/zapier/subscribe/:id", async (c) => {
  sqlite.exec(`DELETE FROM zapier_subscriptions WHERE id = '${c.req.param("id")}'`);
  return c.json({ data: { unsubscribed: true } });
});

// Zapier action: create test
app.post("/zapier/actions/create-test", async (c) => {
  const body = await c.req.json();
  // Forward to test creation API
  const res = await fetch("http://localhost:3456/api/tests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return c.json(data, res.status as any);
});

// Trigger Zapier webhooks (internal helper)
export async function triggerZapierWebhooks(event: string, payload: any) {
  const subs = sqlite.query("SELECT * FROM zapier_subscriptions WHERE event = ?").all(event) as any[];

  for (const sub of subs) {
    try {
      await fetch(sub.hook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error(`[Zapier] Failed to trigger ${sub.hook_url}: ${err}`);
    }
  }
}

export default app;
