import type { EventType } from "../../shared/types";

export interface ESPEvent {
  eventId: string;
  type: EventType;
  recipientEmail: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ESPAdapter {
  name: string;
  send(to: string, subject: string, html: string, metadata?: Record<string, string>): Promise<{ messageId: string }>;
  getStatus(messageId: string): Promise<{ status: string }>;
  parseWebhook(payload: unknown): ESPEvent[];
}

export class MockESPAdapter implements ESPAdapter {
  name = "mock";

  async send(to: string, subject: string, _html: string) {
    const messageId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[MockESP] Sent to ${to}: "${subject}" (${messageId})`);
    return { messageId };
  }

  async getStatus(messageId: string) {
    return { status: "delivered" };
  }

  parseWebhook(payload: unknown): ESPEvent[] {
    const p = payload as { events?: ESPEvent[] };
    return p.events ?? [];
  }
}

const adapters = new Map<string, ESPAdapter>();
adapters.set("mock", new MockESPAdapter());

export function getAdapter(name: string): ESPAdapter {
  const adapter = adapters.get(name);
  if (!adapter) throw new Error(`ESP adapter "${name}" not found`);
  return adapter;
}

export function registerAdapter(adapter: ESPAdapter) {
  adapters.set(adapter.name, adapter);
}
