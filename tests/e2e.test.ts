import { describe, test, expect, beforeAll } from "bun:test";

const API = "http://localhost:3456/api";

async function req(path: string, options?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    ...options,
  });
  return { status: res.status, data: await res.json() };
}

describe("E2E: Health", () => {
  test("health check returns ok", async () => {
    const { data } = await req("/health");
    expect(data.status).toBe("ok");
    expect(data.services.database).toBe("up");
  });
});

describe("E2E: Auth Flow", () => {
  const email = `e2e_${Date.now()}@test.com`;

  test("register creates user and workspace", async () => {
    const { status, data } = await req("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password: "testpass123", name: "E2E User", workspaceName: "E2E Workspace" }),
    });
    expect(status).toBe(201);
    expect(data.data.email).toBe(email);
    expect(data.data.workspaceId).toBeTruthy();
  });

  test("login returns user data", async () => {
    const { status, data } = await req("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: "testpass123" }),
    });
    expect(status).toBe(200);
    expect(data.data.email).toBe(email);
    expect(data.data.role).toBe("owner");
  });

  test("invalid login returns 401", async () => {
    const { status } = await req("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: "wrongpass" }),
    });
    expect(status).toBe(401);
  });

  test("magic link request succeeds", async () => {
    const { status, data } = await req("/auth/magic-link", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    expect(status).toBe(200);
    expect(data.data.sent).toBe(true);
  });
});

describe("E2E: Test Lifecycle", () => {
  let testId: string;
  let variantAId: string;
  let variantBId: string;

  test("create test", async () => {
    const { status, data } = await req("/tests", {
      method: "POST",
      body: JSON.stringify({ name: "E2E Test", trafficSplit: [60, 40] }),
    });
    expect(status).toBe(201);
    expect(data.data.name).toBe("E2E Test");
    testId = data.data.id;
  });

  test("add variant A", async () => {
    const { status, data } = await req(`/tests/${testId}/variants`, {
      method: "POST",
      body: JSON.stringify({ label: "Variant A", subject: "Hello World", preheader: "Test", bodyHtml: "<p>Hello</p>" }),
    });
    expect(status).toBe(201);
    variantAId = data.data.id;
  });

  test("add variant B", async () => {
    const { status, data } = await req(`/tests/${testId}/variants`, {
      method: "POST",
      body: JSON.stringify({ label: "Variant B", subject: "Hi There", preheader: "Test", bodyHtml: "<p>Hi</p>" }),
    });
    expect(status).toBe(201);
    variantBId = data.data.id;
  });

  test("update variant", async () => {
    const { status, data } = await req(`/tests/${testId}/variants/${variantAId}`, {
      method: "PATCH",
      body: JSON.stringify({ subject: "Updated Subject" }),
    });
    expect(status).toBe(200);
    expect(data.data.subject).toBe("Updated Subject");
  });

  test("get test shows both variants", async () => {
    const { data } = await req(`/tests/${testId}`);
    expect(data.data.variants.length).toBe(2);
    expect(data.data.trafficSplit).toEqual([60, 40]);
  });

  test("start test triggers dispatch simulation", async () => {
    const { status, data } = await req(`/tests/${testId}/start`, { method: "POST" });
    expect(status).toBe(200);
    expect(data.data.status).toBe("running");
  });

  test("analytics show metrics after start", async () => {
    const { data } = await req(`/tests/${testId}`);
    expect(data.data.status).toBe("running");
    const va = data.data.variants.find((v: any) => v.id === variantAId);
    expect(va.metrics.sent).toBeGreaterThan(0);
    expect(va.metrics.openRate).toBeGreaterThan(0);
  });

  test("statistical analysis returned", async () => {
    const { data } = await req(`/tests/${testId}`);
    expect(data.data.stats).toBeTruthy();
    expect(data.data.stats.length).toBeGreaterThan(0);
    expect(data.data.stats[0].explanation).toBeTruthy();
  });

  test("declare winner completes test", async () => {
    const { status, data } = await req(`/tests/${testId}/declare-winner`, {
      method: "POST",
      body: JSON.stringify({ variantId: variantAId }),
    });
    expect(status).toBe(200);
    expect(data.data.status).toBe("completed");
  });

  test("test status is now completed", async () => {
    const { data } = await req(`/tests/${testId}`);
    expect(data.data.status).toBe("completed");
  });

  test("enforces max 5 variants", async () => {
    const newTest = await req("/tests", {
      method: "POST",
      body: JSON.stringify({ name: "Max Variant Test" }),
    });
    const tid = newTest.data.data.id;
    for (let i = 0; i < 5; i++) {
      await req(`/tests/${tid}/variants`, {
        method: "POST",
        body: JSON.stringify({ label: `V${i}`, subject: `Subject ${i}` }),
      });
    }
    const { status } = await req(`/tests/${tid}/variants`, {
      method: "POST",
      body: JSON.stringify({ label: "V6", subject: "Too many" }),
    });
    expect(status).toBe(400);
  });

  test("delete test", async () => {
    const { status } = await req(`/tests/${testId}`, { method: "DELETE" });
    expect(status).toBe(200);
  });
});

describe("E2E: CSV Export", () => {
  test("exports CSV for seeded test", async () => {
    const res = await fetch(`${API}/analytics/test_spring/export/csv`, {
      headers: { Origin: "http://localhost:5173" },
    });
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("variant_label");
    expect(csv).toContain("Variant A");
    expect(csv).toContain("Variant B");
  });
});

describe("E2E: Templates", () => {
  test("system templates exist", async () => {
    const { data } = await req("/templates");
    expect(data.data.length).toBeGreaterThanOrEqual(5);
  });

  test("create and retrieve template", async () => {
    // Register first to get auth
    const email = `tmpl_${Date.now()}@test.com`;
    const regRes = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
      body: JSON.stringify({ email, password: "pass123", name: "Tmpl User" }),
    });
    const cookie = regRes.headers.get("set-cookie") || "";

    const createRes = await fetch(`${API}/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
      body: JSON.stringify({ name: "E2E Template", category: "test", subject: "Test", bodyHtml: "<p>Test</p>" }),
    });
    const created = await createRes.json() as any;
    expect(created.data.id).toBeTruthy();

    const { data: get } = await req(`/templates/${created.data.id}`);
    expect(get.data.name).toBe("E2E Template");
  });
});

describe("E2E: Segments", () => {
  test("create segment", async () => {
    const { status, data } = await req("/segments", {
      method: "POST",
      body: JSON.stringify({
        name: "Active Users",
        filters: { logic: "and", conditions: [{ field: "tag", operator: "includes", value: "active" }] },
      }),
    });
    expect(status).toBe(201);
    expect(data.data.id).toBeTruthy();
  });

  test("preview segment returns count", async () => {
    const { data } = await req("/segments/preview", {
      method: "POST",
      body: JSON.stringify({ filters: { logic: "and", conditions: [] } }),
    });
    expect(data.data.count).toBeGreaterThanOrEqual(0);
  });

  test("import recipients", async () => {
    const { data } = await req("/segments/recipients/import", {
      method: "POST",
      body: JSON.stringify({
        recipients: [
          { email: "alice@test.com", tags: ["active"], properties: { plan: "pro" } },
          { email: "bob@test.com", tags: ["trial"], properties: { plan: "free" } },
        ],
      }),
    });
    expect(data.data.imported).toBe(2);
  });
});

describe("E2E: Integrations", () => {
  test("zapier subscribe and unsubscribe", async () => {
    const { status, data } = await req("/integrations/zapier/subscribe", {
      method: "POST",
      body: JSON.stringify({ hookUrl: "https://hooks.zapier.com/test", event: "test_completed" }),
    });
    expect(status).toBe(201);

    const { status: delStatus } = await req(`/integrations/zapier/subscribe/${data.data.id}`, {
      method: "DELETE",
    });
    expect(delStatus).toBe(200);
  });
});

describe("E2E: List Tests", () => {
  test("list returns seeded tests", async () => {
    const { data } = await req("/tests");
    expect(data.data.length).toBeGreaterThanOrEqual(2); // At least the seeded ones
  });
});
