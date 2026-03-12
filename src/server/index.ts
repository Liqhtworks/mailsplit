import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import testRoutes from "./routes/tests";
import segmentRoutes from "./routes/segments";
import analyticsRoutes from "./routes/analytics";
import schedulingRoutes from "./routes/scheduling";
import workspaceRoutes from "./routes/workspace";
import apikeyRoutes from "./routes/apikeys";
import templateRoutes from "./routes/templates";
import integrationRoutes from "./routes/integrations";
import { authRoutes, authMiddleware } from "./auth";
import { securityHeaders, csrfProtection, rateLimit, maxBodySize } from "./middleware/security";
import { restoreSchedules } from "./routes/scheduling";
import { db, sqlite } from "./db";

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use("*", securityHeaders);
app.use("/api/*", cors({ origin: ["http://localhost:5173", "http://localhost:5174"], credentials: true }));
app.use("/api/*", maxBodySize(10 * 1024 * 1024)); // 10MB
app.use("/api/*", csrfProtection);
app.use("/api/*", authMiddleware);

// Rate limiting on auth endpoints
app.use("/api/auth/login", rateLimit(20, 60000));
app.use("/api/auth/register", rateLimit(5, 60000));
app.use("/api/auth/magic-link", rateLimit(5, 60000));

// Health check
app.get("/api/health", (c) => {
  const dbOk = (() => { try { sqlite.exec("SELECT 1"); return true; } catch { return false; } })();
  return c.json({
    status: dbOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: { database: dbOk ? "up" : "down", queue: "up" },
  });
});

// Mount routes
app.route("/api/auth", authRoutes);
app.route("/api/tests", testRoutes);
app.route("/api/segments", segmentRoutes);
app.route("/api/analytics", analyticsRoutes);
app.route("/api/schedules", schedulingRoutes);
app.route("/api/workspace", workspaceRoutes);
app.route("/api/keys", apikeyRoutes);
app.route("/api/templates", templateRoutes);
app.route("/api/integrations", integrationRoutes);

// Initialize database tables
function initDb() {
  const stmts = [
    // Core tables
    `CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, plan TEXT DEFAULT 'free', created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT, name TEXT, role TEXT NOT NULL DEFAULT 'editor', workspace_id TEXT REFERENCES workspaces(id), created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS tests (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', audience_segment TEXT, traffic_split TEXT DEFAULT '[]', scheduled_at TEXT, workspace_id TEXT REFERENCES workspaces(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS variants (id TEXT PRIMARY KEY, test_id TEXT NOT NULL REFERENCES tests(id), label TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', preheader TEXT DEFAULT '', body_html TEXT DEFAULT '', created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS recipients (id TEXT PRIMARY KEY, email TEXT NOT NULL, tags TEXT DEFAULT '[]', properties TEXT DEFAULT '{}', workspace_id TEXT REFERENCES workspaces(id), created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, variant_id TEXT NOT NULL REFERENCES variants(id), recipient_id TEXT REFERENCES recipients(id), type TEXT NOT NULL, metadata TEXT DEFAULT '{}', timestamp TEXT NOT NULL)`,
    // Auth extensions
    `CREATE TABLE IF NOT EXISTS magic_links (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, name TEXT NOT NULL, key_hash TEXT NOT NULL, prefix TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS invitations (token TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL, workspace_id TEXT NOT NULL, invited_by TEXT NOT NULL, accepted_at TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`,
    // Segments
    `CREATE TABLE IF NOT EXISTS segments (id TEXT PRIMARY KEY, name TEXT NOT NULL, filters TEXT DEFAULT '{}', workspace_id TEXT, created_at TEXT NOT NULL)`,
    // Scheduling
    `CREATE TABLE IF NOT EXISTS schedules (test_id TEXT PRIMARY KEY, scheduled_at TEXT NOT NULL, timezone TEXT DEFAULT 'UTC', recurring TEXT, created_at TEXT NOT NULL)`,
    // Templates
    `CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT 'general', subject TEXT DEFAULT '', preheader TEXT DEFAULT '', body_html TEXT DEFAULT '', workspace_id TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    // Integrations
    `CREATE TABLE IF NOT EXISTS slack_config (workspace_id TEXT PRIMARY KEY, webhook_url TEXT NOT NULL, channel TEXT DEFAULT '#general', notify_start INTEGER DEFAULT 1, notify_significance INTEGER DEFAULT 1, notify_winner INTEGER DEFAULT 1, notify_complete INTEGER DEFAULT 1, notify_error INTEGER DEFAULT 1, connected_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS zapier_subscriptions (id TEXT PRIMARY KEY, hook_url TEXT NOT NULL, event TEXT NOT NULL, api_key TEXT, created_at TEXT NOT NULL)`,
    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_events_variant_id ON events(variant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_variants_test_id ON variants(test_id)`,
    `CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`,
    `CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_recipients_workspace ON recipients(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`,
  ];
  for (const s of stmts) sqlite.exec(s);

  // Seed system templates
  const hasTemplates = sqlite.query("SELECT COUNT(*) as c FROM templates WHERE workspace_id = 'system'").get() as any;
  if (hasTemplates.c === 0) {
    const now = new Date().toISOString();
    const systemTemplates = [
      { name: "Welcome Email", category: "onboarding", subject: "Welcome to {{company}}!", body: "<h1>Welcome!</h1><p>We're glad you're here, {{first_name}}.</p>" },
      { name: "Newsletter", category: "newsletter", subject: "This week at {{company}}", body: "<h1>Weekly Update</h1><p>Here's what's new.</p>" },
      { name: "Promotion", category: "marketing", subject: "Special offer just for you", body: "<h1>Limited Time Offer</h1><p>Don't miss out on these deals.</p>" },
      { name: "Re-engagement", category: "marketing", subject: "We miss you, {{first_name}}!", body: "<h1>It's been a while</h1><p>Come back and see what's new.</p>" },
      { name: "Product Update", category: "product", subject: "New features you'll love", body: "<h1>What's New</h1><p>Check out our latest improvements.</p>" },
    ];
    const insertTmpl = sqlite.prepare("INSERT INTO templates (id, name, category, subject, body_html, workspace_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'system', 'system', ?, ?)");
    systemTemplates.forEach((t, i) => {
      insertTmpl.run(`tmpl_${t.category}_${i}`, t.name, t.category, t.subject, t.body, now, now);
    });
  }
}

initDb();
restoreSchedules();

console.log("MailSplit API server running on http://localhost:3456");

export default {
  port: 3456,
  fetch: app.fetch,
};
