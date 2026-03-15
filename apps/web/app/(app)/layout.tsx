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
    <div className="min-h-screen overflow-x-hidden bg-black text-white">
      <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
        <div className="grid gap-3 lg:grid-cols-[240px_1fr] lg:gap-4">
          <aside className="rounded-[28px] border border-slate-700 bg-black p-4 shadow-[0_0_0_1px_rgba(30,41,59,.2)] sm:p-5">
            <div className="text-3xl font-extrabold tracking-tight text-white lg:text-2xl">
              GC Suite
            </div>
            <div className="mt-1 text-sm text-slate-400">Command Center</div>

            <nav className="mt-5 space-y-2">
              <Link
                className="block rounded-2xl px-3 py-3 text-lg font-medium text-[#3b82f6] transition hover:bg-slate-950 hover:text-[#60a5fa] lg:py-2 lg:text-sm"
                href="/dashboard"
              >
                Dashboard
              </Link>

              <Link
                className="block rounded-2xl px-3 py-3 text-lg font-medium text-[#3b82f6] transition hover:bg-slate-950 hover:text-[#60a5fa] lg:py-2 lg:text-sm"
                href={plansHref}
              >
                Projects
              </Link>
            </nav>

            {!activeProjectId ? (
              <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300">
                No active project selected. Choose one in Projects.
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300">
                <span className="font-semibold text-white">Active Project:</span>{" "}
                <span className="break-all font-mono text-slate-300">{activeProjectId}</span>
              </div>
            )}

            <div className="mt-6">
              <button
                onClick={handleLogout}
                className="w-full rounded-2xl bg-[#1d4ed8] px-4 py-3 text-base font-semibold text-white transition hover:bg-[#2563eb] lg:py-2 lg:text-sm"
                type="button"
              >
                Logout
              </button>
            </div>
          </aside>

          <main className="min-w-0 rounded-[28px] border border-slate-700 bg-black p-3 shadow-[0_0_0_1px_rgba(30,41,59,.2)] sm:p-4 lg:p-5">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}