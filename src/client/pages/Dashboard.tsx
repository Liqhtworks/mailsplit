import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

const statusColors: Record<string, string> = {
  draft: "bg-sand-3 text-sand-11",
  scheduled: "bg-blue-100 text-blue-700",
  running: "bg-emerald-100 text-emerald-700",
  completed: "bg-gold-100 text-gold-800",
  cancelled: "bg-red-100 text-red-700",
};

export function Dashboard() {
  const [tests, setTests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.listTests().then((data) => {
      setTests(data);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-gold-700 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-sand-12">A/B Tests</h1>
          <p className="text-sand-11 mt-1">
            {tests.length} test{tests.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {tests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-sand-5">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-sand-3 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#716F6C" strokeWidth="1.5">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-sand-12 mb-2">No tests yet</h3>
          <p className="text-sand-11 mb-6">Create your first A/B test to get started.</p>
          <Link
            to="/new"
            className="inline-flex px-6 py-2.5 rounded-lg bg-gold-700 text-white font-medium hover:bg-gold-800 transition-colors"
          >
            Create Test
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {tests.map((test: any) => (
            <Link
              key={test.id}
              to={`/tests/${test.id}`}
              className="block bg-white rounded-xl border border-sand-5 p-6 hover:border-gold-400 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-sand-12">
                      {test.name}
                    </h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        statusColors[test.status] || statusColors.draft
                      }`}
                    >
                      {test.status}
                    </span>
                  </div>
                  <p className="text-sm text-sand-11">
                    {test.variants?.length || 0} variant{test.variants?.length !== 1 ? "s" : ""}
                    {" · "}
                    Created {new Date(test.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#B4B1AB"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>

              {test.variants && test.variants.length > 0 && (
                <div className="mt-4 flex gap-3">
                  {test.variants.map((v: any) => (
                    <div
                      key={v.id}
                      className="flex-1 bg-sand-2 rounded-lg p-3 text-sm"
                    >
                      <div className="font-medium text-sand-12 mb-1">
                        {v.label}
                      </div>
                      <div className="text-sand-11 truncate">{v.subject}</div>
                    </div>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
