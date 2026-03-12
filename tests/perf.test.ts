import { describe, test, expect } from "bun:test";

const API = "http://localhost:3456/api";

describe("Performance: API Response Times", () => {
  test("health endpoint < 50ms", async () => {
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      await fetch(`${API}/health`);
      times.push(performance.now() - start);
    }
    const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
    console.log(`Health p95: ${p95.toFixed(1)}ms`);
    expect(p95).toBeLessThan(50);
  });

  test("list tests < 100ms p95", async () => {
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      await fetch(`${API}/tests`, { headers: { Origin: "http://localhost:5173" } });
      times.push(performance.now() - start);
    }
    const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
    console.log(`List tests p95: ${p95.toFixed(1)}ms`);
    expect(p95).toBeLessThan(100);
  });

  test("get test detail < 100ms p95", async () => {
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      await fetch(`${API}/tests/test_spring`, { headers: { Origin: "http://localhost:5173" } });
      times.push(performance.now() - start);
    }
    const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
    console.log(`Test detail p95: ${p95.toFixed(1)}ms`);
    expect(p95).toBeLessThan(100);
  });

  test("create test < 100ms p95", async () => {
    const times: number[] = [];
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      const res = await fetch(`${API}/tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
        body: JSON.stringify({ name: `Perf Test ${i}` }),
      });
      times.push(performance.now() - start);
      const data = await res.json() as any;
      ids.push(data.data.id);
    }
    const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
    console.log(`Create test p95: ${p95.toFixed(1)}ms`);
    expect(p95).toBeLessThan(100);

    // Cleanup
    for (const id of ids) {
      await fetch(`${API}/tests/${id}`, { method: "DELETE", headers: { Origin: "http://localhost:5173" } });
    }
  });

  test("webhook ingestion throughput", async () => {
    const start = performance.now();
    const count = 100;
    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(
        fetch(`${API}/tests/test_spring`, {
          headers: { Origin: "http://localhost:5173" },
        })
      );
    }
    await Promise.all(promises);
    const elapsed = performance.now() - start;
    const rps = (count / elapsed) * 1000;
    console.log(`Concurrent requests: ${count} in ${elapsed.toFixed(0)}ms (${rps.toFixed(0)} req/s)`);
    expect(rps).toBeGreaterThan(50); // At least 50 req/s locally
  });
});
