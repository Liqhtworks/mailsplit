import type { Context, Next } from "hono";
import { sqlite } from "../db";

// Rate limiter using in-memory store (Redis in production)
const rateLimits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return async (c: Context, next: Next) => {
    const key = `${c.req.path}:${c.req.header("x-forwarded-for") || "local"}`;
    const now = Date.now();
    const entry = rateLimits.get(key);

    if (entry && entry.resetAt > now) {
      if (entry.count >= maxRequests) {
        c.header("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
        return c.json({ error: "Too many requests" }, 429);
      }
      entry.count++;
    } else {
      rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    }

    await next();
  };
}

// Security headers
export async function securityHeaders(c: Context, next: Next) {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:;");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

// CSRF protection (check Origin/Referer for state-mutating requests)
export async function csrfProtection(c: Context, next: Next) {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next();
  }

  // Skip CSRF for API key auth and webhooks
  if (c.req.header("Authorization")?.startsWith("Bearer ")) return next();
  if (c.req.path.includes("/webhooks/")) return next();
  if (c.req.path.includes("/zapier/")) return next();

  const origin = c.req.header("Origin");
  const referer = c.req.header("Referer");

  if (origin || referer) {
    const allowedOrigins = ["http://localhost:5173", "http://localhost:5174", "http://localhost:3456"];
    const requestOrigin = origin || new URL(referer!).origin;
    if (!allowedOrigins.includes(requestOrigin)) {
      return c.json({ error: "CSRF validation failed" }, 403);
    }
  }

  await next();
}

// Input sanitization for HTML content
export function sanitizeHtml(html: string): string {
  // Remove script tags and event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/on\w+\s*=\s*\S+/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/data\s*:\s*text\/html/gi, "");
}

// Request size limiter
export function maxBodySize(maxBytes: number) {
  return async (c: Context, next: Next) => {
    const contentLength = c.req.header("content-length");
    if (contentLength && parseInt(contentLength) > maxBytes) {
      return c.json({ error: "Request body too large" }, 413);
    }
    await next();
  };
}
