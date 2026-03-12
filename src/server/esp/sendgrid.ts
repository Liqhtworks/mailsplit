import type { ESPAdapter, ESPEvent } from "./interface";

export class SendGridAdapter implements ESPAdapter {
  name = "sendgrid";
  private apiKey: string;
  private baseUrl = "https://api.sendgrid.com/v3";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(to: string, subject: string, html: string, metadata?: Record<string, string>) {
    const res = await fetch(`${this.baseUrl}/mail/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }], custom_args: metadata }],
        from: { email: metadata?.from || "noreply@mailsplit.app" },
        subject,
        content: [{ type: "text/html", value: html }],
      }),
    });

    if (res.status === 429) {
      throw new Error("RATE_LIMITED");
    }
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`SendGrid error: ${res.status} ${err}`);
    }

    const messageId = res.headers.get("x-message-id") || `sg_${Date.now()}`;
    return { messageId };
  }

  async getStatus(messageId: string) {
    const res = await fetch(`${this.baseUrl}/messages/${messageId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) return { status: "unknown" };
    const data = (await res.json()) as any;
    return { status: data.status || "unknown" };
  }

  parseWebhook(payload: unknown): ESPEvent[] {
    const events = payload as any[];
    if (!Array.isArray(events)) return [];

    return events.map((e) => {
      const typeMap: Record<string, string> = {
        delivered: "send",
        open: "open",
        click: "click",
        bounce: "bounce",
        unsubscribe: "unsubscribe",
        spamreport: "bounce",
      };
      return {
        eventId: e.sg_event_id || `sg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        type: (typeMap[e.event] || "send") as ESPEvent["type"],
        recipientEmail: e.email,
        timestamp: new Date((e.timestamp || 0) * 1000).toISOString(),
        metadata: { url: e.url, ip: e.ip, useragent: e.useragent },
      };
    });
  }

  // Verify webhook signature
  static verifySignature(publicKey: string, payload: string, signature: string, timestamp: string): boolean {
    // In production: use crypto.subtle.verify with the ECDSA public key
    // SendGrid signs: timestamp + payload with ECDSA
    return true; // Stub - implement with real public key verification
  }
}
