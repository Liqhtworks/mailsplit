import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
const COLORS = ["#AD8B00", "#4A9B6E", "#6366F1", "#D4954A", "#C45C5C"];

const statusColors: Record<string, string> = {
  draft: "bg-sand-3 text-sand-11",
  scheduled: "bg-blue-100 text-blue-700",
  running: "bg-emerald-100 text-emerald-700",
  completed: "bg-gold-100 text-gold-800",
  cancelled: "bg-red-100 text-red-700",
};

function MetricChart({ title, variants, metric }: { title: string; variants: any[]; metric: string }) {
  const maxRate = Math.max(...variants.map((v: any) => v.metrics?.[metric] || 0), 0.01);

  return (
    <div className="bg-white rounded-xl border border-sand-5 p-6">
      <h3 className="text-sm font-semibold text-sand-12 mb-4">{title}</h3>
      <div className="flex items-end gap-6 h-48">
        {variants.map((v: any, i: number) => {
          const rate = v.metrics?.[metric] || 0;
          const pct = (rate / maxRate) * 100;
          return (
            <div key={v.id} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-sm font-semibold text-sand-12">
                {(rate * 100).toFixed(1)}%
              </span>
              <div className="w-full flex items-end" style={{ height: "140px" }}>
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{
                    height: `${Math.max(pct, 2)}%`,
                    backgroundColor: COLORS[i % COLORS.length],
                  }}
                />
              </div>
              <span className="text-xs text-sand-11 truncate max-w-full">{v.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  const loadTest = async () => {
    if (!id) return;
    const data = await api.getTest(id);
    setTest(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadTest();
  }, [id]);

  const handleStart = async () => {
    if (!id) return;
    setIsStarting(true);
    try {
      await api.startTest(id);
      await loadTest();
    } catch (e: any) {
      alert(e.message);
    }
    setIsStarting(false);
  };

  const handleDeclareWinner = async (variantId: string) => {
    if (!id) return;
    await api.declareWinner(id, variantId);
    await loadTest();
  };

  const handleDelete = async () => {
    if (!id || !confirm("Delete this test?")) return;
    await api.deleteTest(id);
    navigate("/");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-gold-700 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!test) {
    return <div className="text-center py-16 text-sand-11">Test not found</div>;
  }

  const hasMetrics = test.variants?.some((v: any) => v.metrics && v.metrics.sent > 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <button
            onClick={() => navigate("/")}
            className="text-sm text-sand-11 hover:text-sand-12 mb-2 flex items-center gap-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to tests
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-sand-12">{test.name}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[test.status]}`}>
              {test.status}
            </span>
          </div>
          <p className="text-sand-11 mt-1">
            {test.variants?.length || 0} variants · Split: {(test.trafficSplit || []).join("/")}
          </p>
        </div>
        <div className="flex gap-2">
          {test.status === "draft" && (
            <button
              onClick={handleStart}
              disabled={isStarting || (test.variants?.length || 0) < 2}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {isStarting ? "Starting..." : "Start Test"}
            </button>
          )}
          <button
            onClick={handleDelete}
            className="px-4 py-2 rounded-lg border border-red-200 text-red-600 font-medium hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Stats summary for running/completed tests */}
      {hasMetrics && test.stats && (
        <div className="mb-8 bg-white rounded-xl border border-sand-5 p-6">
          <h2 className="text-lg font-semibold text-sand-12 mb-4">Statistical Analysis</h2>
          <div className="space-y-3">
            {test.stats.map((stat: any, i: number) => (
              <div
                key={i}
                className={`p-4 rounded-lg ${
                  stat.isSignificant ? "bg-emerald-50 border border-emerald-200" : "bg-sand-2"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      stat.isSignificant ? "bg-emerald-500" : "bg-sand-8"
                    }`}
                  />
                  <span className="font-medium text-sm text-sand-12 capitalize">{stat.metric}</span>
                  {stat.isSignificant && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                      {(stat.confidence * 100).toFixed(0)}% confident
                    </span>
                  )}
                </div>
                <p className="text-sm text-sand-11 ml-4">{stat.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      {hasMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <MetricChart title="Open Rate" variants={test.variants} metric="openRate" />
          <MetricChart title="Click-Through Rate" variants={test.variants} metric="clickRate" />
        </div>
      )}

      {/* Variant cards */}
      <h2 className="text-lg font-semibold text-sand-12 mb-4">Variants</h2>
      <div className="grid gap-4">
        {test.variants?.map((variant: any, i: number) => (
          <div
            key={variant.id}
            className="bg-white rounded-xl border border-sand-5 p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[i] }}
                />
                <h3 className="font-semibold text-sand-12">{variant.label}</h3>
              </div>
              {test.status === "running" && (
                <button
                  onClick={() => handleDeclareWinner(variant.id)}
                  className="text-sm px-3 py-1 rounded-md border border-gold-400 text-gold-800 hover:bg-gold-50 transition-colors"
                >
                  Declare Winner
                </button>
              )}
            </div>

            <div className="space-y-2 mb-4">
              <div>
                <span className="text-xs font-medium text-sand-11 uppercase tracking-wide">Subject</span>
                <p className="text-sand-12">{variant.subject || "—"}</p>
              </div>
              {variant.preheader && (
                <div>
                  <span className="text-xs font-medium text-sand-11 uppercase tracking-wide">Preheader</span>
                  <p className="text-sand-11">{variant.preheader}</p>
                </div>
              )}
            </div>

            {variant.metrics && variant.metrics.sent > 0 && (
              <div className="grid grid-cols-5 gap-4 pt-4 border-t border-sand-5">
                <div>
                  <div className="text-xs text-sand-11">Sent</div>
                  <div className="text-lg font-semibold text-sand-12">{variant.metrics.sent}</div>
                </div>
                <div>
                  <div className="text-xs text-sand-11">Opens</div>
                  <div className="text-lg font-semibold text-sand-12">
                    {(variant.metrics.openRate * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-sand-11">{variant.metrics.opens}</div>
                </div>
                <div>
                  <div className="text-xs text-sand-11">Clicks</div>
                  <div className="text-lg font-semibold text-sand-12">
                    {(variant.metrics.clickRate * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-sand-11">{variant.metrics.clicks}</div>
                </div>
                <div>
                  <div className="text-xs text-sand-11">Bounces</div>
                  <div className="text-lg font-semibold text-sand-12">
                    {(variant.metrics.bounceRate * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-sand-11">{variant.metrics.bounces}</div>
                </div>
                <div>
                  <div className="text-xs text-sand-11">Unsubs</div>
                  <div className="text-lg font-semibold text-sand-12">
                    {variant.metrics.unsubscribes}
                  </div>
                </div>
              </div>
            )}

            {variant.bodyHtml && (
              <details className="mt-4">
                <summary className="text-sm text-sand-11 cursor-pointer hover:text-sand-12">
                  Preview body
                </summary>
                <div
                  className="mt-2 p-4 bg-sand-2 rounded-lg text-sm border border-sand-5"
                  dangerouslySetInnerHTML={{ __html: variant.bodyHtml }}
                />
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
