const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json.data;
}

export const api = {
  listTests: () => request<any[]>("/tests"),
  getTest: (id: string) => request<any>(`/tests/${id}`),
  createTest: (data: { name: string; trafficSplit?: number[] }) =>
    request<any>("/tests", { method: "POST", body: JSON.stringify(data) }),
  updateTest: (id: string, data: any) =>
    request<any>(`/tests/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTest: (id: string) =>
    request<any>(`/tests/${id}`, { method: "DELETE" }),
  addVariant: (testId: string, data: { label: string; subject: string; preheader?: string; bodyHtml?: string }) =>
    request<any>(`/tests/${testId}/variants`, { method: "POST", body: JSON.stringify(data) }),
  updateVariant: (testId: string, variantId: string, data: any) =>
    request<any>(`/tests/${testId}/variants/${variantId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteVariant: (testId: string, variantId: string) =>
    request<any>(`/tests/${testId}/variants/${variantId}`, { method: "DELETE" }),
  startTest: (id: string) =>
    request<any>(`/tests/${id}/start`, { method: "POST" }),
  declareWinner: (id: string, variantId: string) =>
    request<any>(`/tests/${id}/declare-winner`, { method: "POST", body: JSON.stringify({ variantId }) }),
};
