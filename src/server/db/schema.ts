import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  plan: text("plan").default("free"),
  createdAt: text("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name"),
  role: text("role").notNull().default("editor"),
  workspaceId: text("workspace_id").references(() => workspaces.id),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: text("expires_at").notNull(),
});

export const tests = sqliteTable("tests", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  audienceSegment: text("audience_segment"),
  trafficSplit: text("traffic_split").default("[]"),
  scheduledAt: text("scheduled_at"),
  workspaceId: text("workspace_id").references(() => workspaces.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const variants = sqliteTable("variants", {
  id: text("id").primaryKey(),
  testId: text("test_id")
    .notNull()
    .references(() => tests.id),
  label: text("label").notNull(),
  subject: text("subject").notNull().default(""),
  preheader: text("preheader").default(""),
  bodyHtml: text("body_html").default(""),
  createdAt: text("created_at").notNull(),
});

export const recipients = sqliteTable("recipients", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  tags: text("tags").default("[]"),
  properties: text("properties").default("{}"),
  workspaceId: text("workspace_id").references(() => workspaces.id),
  createdAt: text("created_at").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  variantId: text("variant_id")
    .notNull()
    .references(() => variants.id),
  recipientId: text("recipient_id").references(() => recipients.id),
  type: text("type").notNull(),
  metadata: text("metadata").default("{}"),
  timestamp: text("timestamp").notNull(),
});

// Relations
export const workspacesRelations = relations(workspaces, ({ many }) => ({
  users: many(users),
  tests: many(tests),
  recipients: many(recipients),
}));

export const usersRelations = relations(users, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [users.workspaceId],
    references: [workspaces.id],
  }),
}));

export const testsRelations = relations(tests, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [tests.workspaceId],
    references: [workspaces.id],
  }),
  variants: many(variants),
}));

export const variantsRelations = relations(variants, ({ one, many }) => ({
  test: one(tests, {
    fields: [variants.testId],
    references: [tests.id],
  }),
  events: many(events),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  variant: one(variants, {
    fields: [events.variantId],
    references: [variants.id],
  }),
  recipient: one(recipients, {
    fields: [events.recipientId],
    references: [recipients.id],
  }),
}));
