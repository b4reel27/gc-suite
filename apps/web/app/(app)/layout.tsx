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
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
        <div className="grid gap-3 lg:grid-cols-[240px_1fr] lg:gap-4">
          <aside className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="text-3xl font-extrabold tracking-tight text-slate-900 lg:text-2xl">
              GC Suite
            </div>
            <div className="mt-1 text-sm text-slate-500">Command Center</div>

            <nav className="mt-5 space-y-2">
              <Link
                className="block rounded-2xl px-3 py-3 text-lg font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 lg:py-2 lg:text-sm"
                href="/dashboard"
              >
                Dashboard
              </Link>

              <Link
                className="block rounded-2xl px-3 py-3 text-lg font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 lg:py-2 lg:text-sm"
                href={plansHref}
              >
                Projects
              </Link>
            </nav>

            {!activeProjectId ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                No active project selected. Choose one in Projects.
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                <span className="font-semibold text-slate-900">Active Project:</span>{" "}
                <span className="break-all font-mono text-slate-600">{activeProjectId}</span>
              </div>
            )}

            <div className="mt-6">
              <button
                onClick={handleLogout}
                className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-base font-semibold text-white transition hover:bg-slate-800 lg:py-2 lg:text-sm"
                type="button"
              >
                Logout
              </button>
            </div>
          </aside>

          <main className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm sm:p-4 lg:p-5">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
