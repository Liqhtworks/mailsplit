export type TestStatus = "draft" | "scheduled" | "running" | "completed" | "cancelled";
export type EventType = "send" | "open" | "click" | "bounce" | "unsubscribe" | "reply";
export type UserRole = "owner" | "admin" | "editor" | "viewer";

export interface TestWithVariants {
  id: string;
  name: string;
  status: TestStatus;
  trafficSplit: number[];
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  variants: VariantWithMetrics[];
}

export interface VariantWithMetrics {
  id: string;
  testId: string;
  label: string;
  subject: string;
  preheader: string;
  bodyHtml: string;
  metrics: VariantMetrics;
}

export interface VariantMetrics {
  sent: number;
  opens: number;
  clicks: number;
  bounces: number;
  unsubscribes: number;
  replies: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

export interface StatResult {
  variantAId: string;
  variantBId: string;
  metric: string;
  zScore: number;
  pValue: number;
  isSignificant: boolean;
  confidence: number;
  explanation: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
