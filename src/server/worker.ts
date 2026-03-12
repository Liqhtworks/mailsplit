// Background worker for email dispatch processing
// In production: connects to Redis via BullMQ for reliable job processing

import { db, sqlite } from "./db";
import { eq } from "drizzle-orm";
import { tests, variants, events } from "./db/schema";
import { getAdapter } from "./esp/interface";
import { nanoid } from "nanoid";

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "50");
const POLL_INTERVAL = 5000;

interface SendJob {
  testId: string;
  variantId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  espName: string;
  attempt: number;
}

const jobQueue: SendJob[] = [];
let isProcessing = false;

export async function enqueueDispatch(testId: string) {
  const test = await db.query.tests.findFirst({
    where: eq(tests.id, testId),
    with: { variants: true },
  });
  if (!test) return;

  const split = JSON.parse(test.trafficSplit || "[50,50]") as number[];
  const allRecipients = sqlite.query(
    "SELECT * FROM recipients WHERE workspace_id = ? LIMIT 10000"
  ).all(test.workspaceId || "") as any[];

  const totalAudience = allRecipients.length || 1000;
  let offset = 0;

  for (let i = 0; i < test.variants.length; i++) {
    const variant = test.variants[i];
    const count = Math.floor((totalAudience * (split[i] || 50)) / 100);
    const recipients = allRecipients.slice(offset, offset + count);
    offset += count;

    for (const r of recipients) {
      jobQueue.push({
        testId,
        variantId: variant.id,
        recipientEmail: r.email,
        subject: variant.subject,
        bodyHtml: variant.bodyHtml,
        espName: "mock",
        attempt: 0,
      });
    }
  }

  console.log(`[Worker] Enqueued ${jobQueue.length} sends for test ${testId}`);
  processQueue();
}

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (jobQueue.length > 0) {
    const batch = jobQueue.splice(0, CONCURRENCY);
    await Promise.allSettled(batch.map(processJob));
    // Respect rate limits
    await new Promise((r) => setTimeout(r, 1000));
  }

  isProcessing = false;
}

async function processJob(job: SendJob) {
  try {
    const adapter = getAdapter(job.espName);
    const idempotencyKey = `${job.testId}:${job.variantId}:${job.recipientEmail}`;

    // Check idempotency
    const existing = sqlite.query(
      "SELECT id FROM events WHERE variant_id = ? AND type = 'send' AND metadata LIKE ?"
    ).get(job.variantId, `%${job.recipientEmail}%`);

    if (existing) return; // Already sent

    const { messageId } = await adapter.send(job.recipientEmail, job.subject, job.bodyHtml, {
      testId: job.testId,
      variantId: job.variantId,
    });

    await db.insert(events).values({
      id: nanoid(10),
      variantId: job.variantId,
      type: "send",
      metadata: JSON.stringify({ messageId, email: job.recipientEmail }),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err.message === "RATE_LIMITED" && job.attempt < 3) {
      // Exponential backoff retry
      const delay = Math.pow(2, job.attempt) * 1000;
      setTimeout(() => {
        jobQueue.push({ ...job, attempt: job.attempt + 1 });
        processQueue();
      }, delay);
    } else {
      console.error(`[Worker] Failed to send to ${job.recipientEmail}: ${err.message}`);
    }
  }
}

console.log("[Worker] Background worker started, polling for jobs...");

// Poll for scheduled test starts
setInterval(async () => {
  const scheduled = sqlite.query(
    "SELECT * FROM tests WHERE status = 'scheduled' AND scheduled_at <= ?"
  ).all(new Date().toISOString()) as any[];

  for (const test of scheduled) {
    console.log(`[Worker] Starting scheduled test: ${test.id}`);
    sqlite.exec(`UPDATE tests SET status = 'running', updated_at = '${new Date().toISOString()}' WHERE id = '${test.id}'`);
    await enqueueDispatch(test.id);
  }
}, POLL_INTERVAL);
