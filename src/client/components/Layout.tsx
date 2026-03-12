import React from "react";
import { Link, useLocation } from "react-router-dom";

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-sand-1">
      <header className="border-b border-sand-5 bg-white">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gold-700 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <span className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
              MailSplit
            </span>
          </Link>

          <nav className="flex items-center gap-4">
            <Link
              to="/"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                location.pathname === "/"
                  ? "bg-sand-3 text-sand-12"
                  : "text-sand-11 hover:text-sand-12"
              }`}
            >
              Tests
            </Link>
            <Link
              to="/new"
              className="px-4 py-2 rounded-md text-sm font-medium bg-gold-700 text-white hover:bg-gold-800 transition-colors"
            >
              + New Test
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
