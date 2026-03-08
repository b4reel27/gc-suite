"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [activeProjectId, setActiveProjectId] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("activeProjectId") || "";
    setActiveProjectId(id);
  }, []);

  const plansHref = activeProjectId ? `/projects/${activeProjectId}/plans` : "/projects";

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("activeProjectId");
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-lg font-bold text-slate-900">GC Suite</div>
            <div className="mt-1 text-xs text-slate-500">Command Center</div>

            <nav className="mt-6 space-y-1">
              <Link className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-50" href="/dashboard">
                Dashboard
              </Link>
              <Link className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-50" href={plansHref}>
                Projects
              </Link>
            </nav>

            {!activeProjectId ? (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
                No active project selected. Choose one in Projects.
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
                Active Project: <span className="font-mono">{activeProjectId}</span>
              </div>
            )}

            <div className="mt-8">
              <button
                onClick={handleLogout}
                className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:opacity-90"
                type="button"
              >
                Logout
              </button>
            </div>
          </aside>

          <main className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}