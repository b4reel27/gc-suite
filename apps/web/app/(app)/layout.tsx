"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [activeProjectId, setActiveProjectId] = useState("");
  const [projectName, setProjectName] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("activeProjectId") || "";
    setActiveProjectId(id);

    if (!id) return;

    // Try to get project name from stored user data or the API
    const token = localStorage.getItem("token") || "";
    if (!token || !API_URL) return;

    fetch(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((projects: { id: string; name: string }[]) => {
        const p = Array.isArray(projects) ? projects.find((p) => p.id === id) : null;
        if (p?.name) setProjectName(p.name);
      })
      .catch(() => {});
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
        <div className="grid gap-3 lg:grid-cols-[220px_1fr] lg:gap-4">

          {/* Sidebar */}
          <aside className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div>
              <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                GC Suite
              </div>
              <div className="mt-0.5 text-xs font-medium text-slate-400 uppercase tracking-wide">
                Command Center
              </div>
            </div>

            <nav className="space-y-1">
              <Link
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                href="/dashboard"
              >
                <span className="text-base">&#9632;</span>
                Dashboard
              </Link>

              <Link
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                href="/projects"
              >
                <span className="text-base">&#9650;</span>
                Projects
              </Link>
            </nav>

            {/* Active project indicator */}
            {activeProjectId ? (
              <Link
                href={plansHref}
                className="group rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 transition hover:border-emerald-300 hover:bg-emerald-100"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                  Active Project
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-emerald-900">
                  {projectName || "Loading…"}
                </div>
              </Link>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                No active project. Choose one in{" "}
                <Link href="/projects" className="font-semibold text-slate-700 underline">
                  Projects
                </Link>
                .
              </div>
            )}

            <div className="mt-auto">
              <button
                onClick={handleLogout}
                className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                type="button"
              >
                Logout
              </button>
            </div>
          </aside>

          {/* Main content */}
          <main className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
