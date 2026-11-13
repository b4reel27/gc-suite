"use client";

import Link from "next/link";
import OfflineBanner from "../../components/OfflineBanner";
import GlobalSearch from "../../components/GlobalSearch";
import OfflineSync from "../../components/OfflineSync";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const NAV_GROUPS = [
  {
    label: "Field",
    tabs: [
      { label: "Plans",      path: "plans",      icon: "📐" },
      { label: "Work to Complete", path: "punch", icon: "⚠️" },
      { label: "Schedule",   path: "schedule",   icon: "📅" },
            { label: "Daily Log",  path: "daily-log",  icon: "📝" },
      { label: "Forms / JSA",path: "forms",      icon: "📋" },
    ],
  },
  {
    label: "Project Mgmt",
    tabs: [
      { label: "RFIs",         path: "rfis",       icon: "📨" },
      { label: "Submittals",   path: "submittals", icon: "📦" },
      { label: "Observations", path: "observations", icon: "🔍" },
    ],
  },
  {
    label: "Finance",
    tabs: [
      { label: "Budget",        path: "budget",        icon: "💰" },
      { label: "Change Orders", path: "change-orders", icon: "🔄" },
    ],
  },
  {
    label: "Team",
    tabs: [
      { label: "Directory", path: "directory", icon: "👥" },
      { label: "Meetings",  path: "meetings",  icon: "🤝" },
      { label: "Sub View",   path: "sub",       icon: "👷" },
    ],
  },
];

// Flat list for mobile pill scroll
const ALL_TABS = NAV_GROUPS.flatMap((g) => g.tabs);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [activeProjectId, setActiveProjectId] = useState("");
  const [projectName, setProjectName]         = useState("");
  const [mobileNavOpen, setMobileNavOpen]     = useState(false);
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

  // Close mobile nav on route change
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("activeProjectId");
    window.location.href = "/login";
  }

  const isTabActive = (path: string) => pathname?.includes(`/${path}`);

  return (
    <>
      <OfflineBanner />
      <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-[1400px] overflow-x-hidden lg:min-h-screen">

        {/* ── Desktop Sidebar ────────────────────────────────────────────── */}
        <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
          {/* Brand */}
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="text-lg font-extrabold tracking-tight text-slate-900">GC Suite</div>
            <div className="mt-2 flex items-center gap-2"><GlobalSearch projectId={activeProjectId} /><OfflineSync /></div>
            <div className="mt-0.5 text-xs text-slate-400">Construction Management</div>
          </div>

          {/* Top nav */}
          <div className="border-b border-slate-100 px-3 py-3">
            <div className="flex flex-col gap-1">
              <Link
                href="/dashboard"
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  pathname === "/dashboard"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/projects"
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  pathname === "/projects"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                Projects
              </Link>
            </div>
          </div>

          {/* Project nav */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {activeProjectId ? (
              <>
                {/* Active project label */}
                <div className="mb-3 px-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Active Project</div>
                  <div className="mt-0.5 truncate text-sm font-bold text-slate-800">{projectName || "Loading…"}</div>
                </div>

                {/* Grouped vertical nav */}
                {NAV_GROUPS.map((group) => (
                  <div key={group.label} className="mb-4">
                    <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {group.label}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {group.tabs.map((tab) => {
                        const href = `/projects/${activeProjectId}/${tab.path}`;
                        const active = isTabActive(tab.path);
                        return (
                          <Link
                            key={tab.path}
                            href={href}
                            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                              active
                                ? "bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-emerald-200"
                                : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            }`}
                          >
                            {tab.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
                No active project.{" "}
                <Link href="/projects" className="font-semibold text-slate-700 underline">
                  Choose one
                </Link>
                .
              </div>
            )}
          </div>

          {/* Logout */}
          <div className="border-t border-slate-100 px-4 py-4">
            <button
              onClick={handleLogout}
              type="button"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* ── Mobile Layout ───────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col lg:hidden">
          {/* Brand bar */}
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
            <div className="text-base font-extrabold tracking-tight text-slate-900">GC Suite</div>
            {projectName && (
              <div className="truncate text-xs font-semibold text-slate-500">{projectName}</div>
            )}
          </header>

          {/* 4-tab fixed nav */}
          {activeProjectId && (
            <div className="border-b border-slate-200 bg-emerald-50 px-3 py-2">
              <div className="flex gap-1.5">
                {[
                  { label: "Plans",            path: "plans" },
                  { label: "Daily Log",        path: "daily-log" },
                  { label: "Work to Complete", path: "punch" },
                ].map((tab) => {
                  const active = isTabActive(tab.path);
                  return (
                    <Link
                      key={tab.path}
                      href={`/projects/${activeProjectId}/${tab.path}`}
                      className={`flex-1 rounded-full border py-1 text-center text-[11px] font-semibold transition ${
                        active
                          ? "border-emerald-700 bg-emerald-700 text-white"
                          : "border-emerald-300 bg-white text-emerald-800"
                      }`}
                    >
                      {tab.label}
                    </Link>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setMobileNavOpen((o) => !o)}
                  className={`flex-shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                    mobileNavOpen
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-emerald-300 bg-white text-emerald-800"
                  }`}
                >
                  More
                </button>
              </div>
            </div>
          )}

          {/* More dropdown */}
          {mobileNavOpen && (
            <div className="border-b border-slate-200 bg-white shadow-md">
              <div className="grid grid-cols-3 divide-x divide-slate-100">
                {[
                  { label: "Schedule",      path: `projects/${activeProjectId}/schedule` },
                                    { label: "Forms / JSA",   path: `projects/${activeProjectId}/forms` },
                  { label: "RFIs",          path: `projects/${activeProjectId}/rfis` },
                  { label: "Submittals",    path: `projects/${activeProjectId}/submittals` },
                  { label: "Observations",  path: `projects/${activeProjectId}/observations` },
                  { label: "Budget",        path: `projects/${activeProjectId}/budget` },
                  { label: "Change Orders", path: `projects/${activeProjectId}/change-orders` },
                  { label: "Directory",     path: `projects/${activeProjectId}/directory` },
                  { label: "Meetings",      path: `projects/${activeProjectId}/meetings` },
                  { label: "Projects",      path: "projects" },
                ].map((item) => (
                  <Link
                    key={item.path}
                    href={`/${item.path}`}
                    className="flex items-center justify-center border-b border-slate-100 px-2 py-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {item.label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center justify-center border-b border-slate-100 px-2 py-3 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                >
                  Logout
                </button>
              </div>
            </div>
          )}

          {/* Mobile main content */}
          <main className="flex-1 p-3">
            {children}
          </main>
        </div>

        {/* ── Desktop main content ────────────────────────────────────────── */}
        <main className="hidden flex-1 flex-col lg:flex">
          <div className="flex-1 p-6">
            {children}
          </div>
        </main>

      </div>
    </div>
    </>
  );
}
