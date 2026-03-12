import type { ESPAdapter, ESPEvent } from "./interface";

export class SESAdapter implements ESPAdapter {
  name = "ses";
  private region: string;
  private accessKeyId: string;
  private secretAccessKey: string;

  constructor(config: { region: string; accessKeyId: string; secretAccessKey: string }) {
    this.region = config.region;
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
  }

  private async signRequest(url: string, body: string, headers: Record<string, string>) {
    // AWS Signature V4 signing - simplified for structure
    // In production: use @aws-sdk/client-ses or full SigV4 implementation
    const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    return {
      ...headers,
      "X-Amz-Date": date,
      Authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${date.slice(0, 8)}/${this.region}/ses/aws4_request, SignedHeaders=host;x-amz-date, Signature=stub`,
    };
  }

  async send(to: string, subject: string, html: string, metadata?: Record<string, string>) {
    const endpoint = `https://email.${this.region}.amazonaws.com/v2/email/outbound-emails`;
    const body = JSON.stringify({
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: { Html: { Data: html } },
        },
      },
      FromEmailAddress: metadata?.from || "noreply@mailsplit.app",
      ConfigurationSetName: metadata?.configSet || "mailsplit-tracking",
      EmailTags: Object.entries(metadata || {}).map(([Name, Value]) => ({ Name, Value })),
    });

    const headers = await this.signRequest(endpoint, body, { "Content-Type": "application/json" });
    const res = await fetch(endpoint, { method: "POST", headers, body });

    if (res.status === 429) throw new Error("RATE_LIMITED");
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`SES error: ${res.status} ${err}`);
    }

    const data = (await res.json()) as any;
    return { messageId: data.MessageId || `ses_${Date.now()}` };
  }

  async getStatus(_messageId: string) {
    // SES doesn't have a direct message status API
    // Status comes through SNS notifications / webhooks
    return { status: "delivered" };
  }

  parseWebhook(payload: unknown): ESPEvent[] {
    // SES events come via SNS notifications
    const p = payload as any;

    // Handle SNS subscription confirmation
    if (p.Type === "SubscriptionConfirmation") {
      // Auto-confirm by fetching the SubscribeURL
      fetch(p.SubscribeURL).catch(() => {});
      return [];
    }

    // Parse SNS message containing SES event
    let message = p;
    if (p.Type === "Notification" && typeof p.Message === "string") {
      message = JSON.parse(p.Message);
    }

    const eventType = message.eventType || message.notificationType;
    if (!eventType) return [];

    const typeMap: Record<string, string> = {
      Delivery: "send",
      Send: "send",
      Open: "open",
      Click: "click",
      Bounce: "bounce",
      Complaint: "bounce",
      Reject: "bounce",
    };

    const recipients = message.mail?.destination || [];
    const timestamp = message.mail?.timestamp || new Date().toISOString();

    return recipients.map((email: string) => ({
      eventId: message.mail?.messageId || `ses_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: (typeMap[eventType] || "send") as ESPEvent["type"],
      recipientEmail: email,
      timestamp,
      metadata: {
        bounceType: message.bounce?.bounceType,
        clickUrl: message.click?.link,
        ipAddress: message.click?.ipAddress || message.open?.ipAddress,
      },
    }));
  }
}
