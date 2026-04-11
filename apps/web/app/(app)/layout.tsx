"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const PROJECT_TABS = [
  { label: "Plans",     path: "plans" },
  { label: "Issues",    path: "punch" },
  { label: "Schedule",  path: "schedule" },
  { label: "Forms",     path: "forms" },
  { label: "Daily Log", path: "daily-log" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [activeProjectId, setActiveProjectId] = useState("");
  const [projectName, setProjectName]         = useState("");
  const pathname = usePathname();

  useEffect(() => {
    const id = localStorage.getItem("activeProjectId") || "";
    setActiveProjectId(id);
    if (!id) return;

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

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("activeProjectId");
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-7xl px-2 py-2 sm:px-4 sm:py-4">
        <div className="grid gap-3 lg:grid-cols-[240px_1fr] lg:gap-4">

          {/* ── Sidebar ──────────────────────────────────────────────────── */}
          <aside className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">

            {/* Brand */}
            <div>
              <div className="text-xl font-extrabold tracking-tight text-slate-900">GC Suite</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                Command Center
              </div>
            </div>

            {/* Top nav — side by side */}
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/dashboard"
                className={`rounded-xl border px-2 py-2.5 text-center text-sm font-bold transition ${
                  pathname === "/dashboard"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/projects"
                className={`rounded-xl border px-2 py-2.5 text-center text-sm font-bold transition ${
                  pathname === "/projects"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Projects
              </Link>
            </div>

            {/* Active project + horizontal pill sub-nav */}
            {activeProjectId ? (
              <div className="min-w-0 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-600">
                  Active Project
                </div>
                <div className="mb-2 truncate text-sm font-bold text-emerald-900">
                  {projectName || "Loading…"}
                </div>
                {/* Scrollable pill row */}
                <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {PROJECT_TABS.map((tab) => {
                    const href = `/projects/${activeProjectId}/${tab.path}`;
                    const active = pathname?.includes(`/${tab.path}`);
                    return (
                      <Link
                        key={tab.path}
                        href={href}
                        className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                          active
                            ? "border-emerald-700 bg-emerald-700 text-white"
                            : "border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100"
                        }`}
                      >
                        {tab.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                No active project.{" "}
                <Link href="/projects" className="font-semibold text-slate-700 underline">
                  Choose one
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

          {/* ── Main content ─────────────────────────────────────────────── */}
          <main className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
            {children}
          </main>

        </div>
      </div>
    </div>
  );
}
