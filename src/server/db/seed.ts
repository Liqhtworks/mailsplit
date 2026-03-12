import { db } from "./index";
import { tests, variants, events, workspaces } from "./schema";
import { nanoid } from "nanoid";

const now = new Date().toISOString();

// Create workspace
await db.insert(workspaces).values({
  id: "ws_demo",
  name: "Daisy Studio",
  plan: "pro",
  createdAt: now,
});

// Create test 1 - completed with data
const test1Id = "test_spring";
await db.insert(tests).values({
  id: test1Id,
  name: "Spring Sale Subject Lines",
  status: "completed",
  trafficSplit: JSON.stringify([50, 50]),
  workspaceId: "ws_demo",
  createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  updatedAt: now,
});

const v1aId = nanoid(10);
const v1bId = nanoid(10);
await db.insert(variants).values([
  { id: v1aId, testId: test1Id, label: "Variant A", subject: "🌸 Spring into Savings — 30% Off Everything", preheader: "Limited time offer for our best customers", bodyHtml: "<h1>Spring Sale</h1><p>Get 30% off with code SPRING30</p>", createdAt: now },
  { id: v1bId, testId: test1Id, label: "Variant B", subject: "Your exclusive 30% discount is waiting", preheader: "Don't miss out on spring deals", bodyHtml: "<h1>Exclusive Offer</h1><p>Use code SPRING30 at checkout</p>", createdAt: now },
]);

// Simulate events for test 1
const eventBatch = [];
for (let i = 0; i < 500; i++) {
  eventBatch.push({ id: nanoid(10), variantId: v1aId, type: "send", timestamp: new Date(Date.now() - 86400000 * 2 + i * 1000).toISOString() });
  eventBatch.push({ id: nanoid(10), variantId: v1bId, type: "send", timestamp: new Date(Date.now() - 86400000 * 2 + i * 1000).toISOString() });
}
for (let i = 0; i < 145; i++) {
  eventBatch.push({ id: nanoid(10), variantId: v1aId, type: "open", timestamp: new Date(Date.now() - 86400000 + i * 2000).toISOString() });
}
for (let i = 0; i < 105; i++) {
  eventBatch.push({ id: nanoid(10), variantId: v1bId, type: "open", timestamp: new Date(Date.now() - 86400000 + i * 2000).toISOString() });
}
for (let i = 0; i < 38; i++) {
  eventBatch.push({ id: nanoid(10), variantId: v1aId, type: "click", timestamp: new Date(Date.now() - 86400000 + i * 5000).toISOString() });
}
for (let i = 0; i < 22; i++) {
  eventBatch.push({ id: nanoid(10), variantId: v1bId, type: "click", timestamp: new Date(Date.now() - 86400000 + i * 5000).toISOString() });
}
for (let i = 0; i < 8; i++) {
  eventBatch.push({ id: nanoid(10), variantId: v1aId, type: "bounce", timestamp: now });
}
for (let i = 0; i < 12; i++) {
  eventBatch.push({ id: nanoid(10), variantId: v1bId, type: "bounce", timestamp: now });
}

// Insert in batches
for (let i = 0; i < eventBatch.length; i += 100) {
  await db.insert(events).values(eventBatch.slice(i, i + 100));
}

// Create test 2 - running
const test2Id = "test_welcome";
await db.insert(tests).values({
  id: test2Id,
  name: "Welcome Email A/B Test",
  status: "running",
  trafficSplit: JSON.stringify([33, 33, 34]),
  workspaceId: "ws_demo",
  createdAt: new Date(Date.now() - 86400000).toISOString(),
  updatedAt: now,
});

const v2aId = nanoid(10);
const v2bId = nanoid(10);
const v2cId = nanoid(10);
await db.insert(variants).values([
  { id: v2aId, testId: test2Id, label: "Friendly", subject: "Welcome aboard! Here's what's next 🎉", preheader: "We're so glad you joined us", bodyHtml: "<h1>Welcome!</h1><p>We're thrilled to have you.</p>", createdAt: now },
  { id: v2bId, testId: test2Id, label: "Professional", subject: "Welcome to Daisy Studio — Get Started", preheader: "Your account is ready", bodyHtml: "<h1>Welcome to Daisy Studio</h1><p>Here's how to get started.</p>", createdAt: now },
  { id: v2cId, testId: test2Id, label: "Direct", subject: "Your account is live. What now?", preheader: "3 things to do first", bodyHtml: "<h1>You're In</h1><p>Here are 3 things to do first.</p>", createdAt: now },
]);

const batch2 = [];
for (let i = 0; i < 330; i++) {
  batch2.push({ id: nanoid(10), variantId: v2aId, type: "send", timestamp: new Date(Date.now() - 43200000 + i * 500).toISOString() });
}
for (let i = 0; i < 330; i++) {
  batch2.push({ id: nanoid(10), variantId: v2bId, type: "send", timestamp: new Date(Date.now() - 43200000 + i * 500).toISOString() });
}
for (let i = 0; i < 340; i++) {
  batch2.push({ id: nanoid(10), variantId: v2cId, type: "send", timestamp: new Date(Date.now() - 43200000 + i * 500).toISOString() });
}
// Opens
for (let i = 0; i < 105; i++) batch2.push({ id: nanoid(10), variantId: v2aId, type: "open", timestamp: new Date(Date.now() - 36000000 + i * 1000).toISOString() });
for (let i = 0; i < 72; i++) batch2.push({ id: nanoid(10), variantId: v2bId, type: "open", timestamp: new Date(Date.now() - 36000000 + i * 1000).toISOString() });
for (let i = 0; i < 88; i++) batch2.push({ id: nanoid(10), variantId: v2cId, type: "open", timestamp: new Date(Date.now() - 36000000 + i * 1000).toISOString() });
// Clicks
for (let i = 0; i < 28; i++) batch2.push({ id: nanoid(10), variantId: v2aId, type: "click", timestamp: new Date(Date.now() - 30000000 + i * 2000).toISOString() });
for (let i = 0; i < 15; i++) batch2.push({ id: nanoid(10), variantId: v2bId, type: "click", timestamp: new Date(Date.now() - 30000000 + i * 2000).toISOString() });
for (let i = 0; i < 20; i++) batch2.push({ id: nanoid(10), variantId: v2cId, type: "click", timestamp: new Date(Date.now() - 30000000 + i * 2000).toISOString() });

for (let i = 0; i < batch2.length; i += 100) {
  await db.insert(events).values(batch2.slice(i, i + 100));
}

// Create test 3 - draft
const test3Id = "test_newsletter";
await db.insert(tests).values({
  id: test3Id,
  name: "Newsletter CTA Experiment",
  status: "draft",
  trafficSplit: JSON.stringify([50, 50]),
  workspaceId: "ws_demo",
  createdAt: now,
  updatedAt: now,
});

await db.insert(variants).values([
  { id: nanoid(10), testId: test3Id, label: "Button CTA", subject: "This week in design: trends you need to know", preheader: "Plus: 5 tools we're loving right now", bodyHtml: "<h1>Weekly Roundup</h1><p>Here's what happened.</p><a href='#' style='background:#AD8B00;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;'>Read More</a>", createdAt: now },
  { id: nanoid(10), testId: test3Id, label: "Text Link CTA", subject: "This week in design: trends you need to know", preheader: "Plus: 5 tools we're loving right now", bodyHtml: "<h1>Weekly Roundup</h1><p>Here's what happened.</p><p><a href='#' style='color:#AD8B00;'>Read the full article →</a></p>", createdAt: now },
]);

console.log("✓ Seed data created: 3 tests with variants and events");
