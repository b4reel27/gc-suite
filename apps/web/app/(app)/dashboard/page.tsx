"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || "";
}

function getActiveProjectId() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("activeProjectId") || "";
}

function getStoredUser() {
  if (typeof window === "undefined") return null;

  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function isGcRole(role) {
  return String(role || "").toUpperCase().startsWith("GC");
}

function countIssues(items) {
  const openStatuses = new Set(["OPEN", "IN_PROGRESS", "DONE"]);
  const now = Date.now();

  const open = items.filter((i) =>
    openStatuses.has(String(i.status || "").toUpperCase())
  );

  const overdue = open.filter((i) => {
    if (!i.due_date) return false;
    const d = new Date(i.due_date).getTime();
    return Number.isFinite(d) && d < now;
  });

  const due7 = open.filter((i) => {
    if (!i.due_date) return false;
    const d = new Date(i.due_date).getTime();
    return Number.isFinite(d) && d >= now && d <= now + 7 * 24 * 60 * 60 * 1000;
  });

  return {
    open: open.length,
    overdue: overdue.length,
    due7: due7.length,
  };
}

function countSchedule(items) {
  const now = Date.now();

  const next7 = items.filter((i) => {
    const start = new Date(
      i.start_at || i.start_date || i.start || i.date || ""
    ).getTime();

    if (!Number.isFinite(start)) return false;
    return start >= now && start <= now + 7 * 24 * 60 * 60 * 1000;
  });

  const open = items.filter((i) => {
    const status = String(i.status || "").toUpperCase();
    return status === "OPEN" || status === "DONE";
  });

  return {
    open: open.length,
    next7: next7.length,
  };
}

function countPlans(data) {
  const sheets = Array.isArray(data?.sheets) ? data.sheets : [];

  return {
    totalSheets: sheets.length,
    currentSheets: sheets.filter((s) => s?.current).length,
  };
}

async function apiGet(path, token) {
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();

  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, data: text };
  }
}

function StatCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xs uppercase tracking-wide text-slate-500">{title}</h2>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function TileCard({
  href,
  icon,
  title,
  value,
  subtext,
  disabled = false,
  featured = false,
}) {
  const base =
    "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition active:scale-[0.99]";
  const featuredClass = featured ? "ring-1 ring-slate-200" : "";

  const content = (
    <div
      className={
        disabled
          ? `${base} ${featuredClass} opacity-60`
          : `${base} ${featuredClass} hover:bg-slate-50`
      }
    >
      <div className="flex items-start justify-between">
        <div className="text-4xl">{icon}</div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">
          {value}
        </div>
      </div>

      <div className="mt-5">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {subtext && <p className="text-sm text-slate-500">{subtext}</p>}
      </div>
    </div>
  );

  if (disabled) return content;

  return <Link href={href}>{content}</Link>;
}

export default function DashboardPage() {
  const [tokenReady, setTokenReady] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [project, setProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [issueItems, setIssueItems] = useState([]);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [plansData, setPlansData] = useState({ sheets: [] });
  const [user, setUser] = useState(null);

  useEffect(() => {
    async function load() {
      const token = getToken();
      const storedProjectId = getActiveProjectId();

      if (!token) {
        window.location.href = "/login";
        return;
      }

      setTokenReady(true);
      setActiveProjectId(storedProjectId);
      setUser(getStoredUser());

      const projectsRes = await apiGet("/projects", token);
      const loadedProjects = Array.isArray(projectsRes.data) ? projectsRes.data : [];
      setProjects(loadedProjects);

      const activeProject =
        loadedProjects.find((p) => p.id === storedProjectId) || null;
      setProject(activeProject);

      if (!storedProjectId) return;

      const [issuesRes, scheduleRes, plansRes] = await Promise.all([
        apiGet(`/projects/${storedProjectId}/punch`, token),
        apiGet(`/schedule/${storedProjectId}`, token),
        apiGet(`/projects/${storedProjectId}/plans`, token),
      ]);

      setIssueItems(Array.isArray(issuesRes.data) ? issuesRes.data : []);
      setScheduleItems(Array.isArray(scheduleRes.data) ? scheduleRes.data : []);
      setPlansData(plansRes.data || { sheets: [] });
    }

    load();
  }, []);

  const issueCounts = useMemo(() => countIssues(issueItems), [issueItems]);
  const scheduleCounts = useMemo(() => countSchedule(scheduleItems), [scheduleItems]);
  const planCounts = useMemo(() => countPlans(plansData), [plansData]);

  const plansHref = activeProjectId ? `/projects/${activeProjectId}/plans` : "/projects";
  const issuesHref = activeProjectId ? `/projects/${activeProjectId}/punch` : "/projects";
  const scheduleHref = activeProjectId ? `/projects/${activeProjectId}/schedule` : "/projects";

  const hasProject = !!project;

  if (!tokenReady) return <div className="p-6">Loading...</div>;

  return (
    <div className="space-y-6">

      {/* HEADER */}

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>

            {project && (
              <p className="text-slate-600">
                <span className="font-semibold">{project.name}</span>
                {project.location ? ` — ${project.location}` : ""}
              </p>
            )}
          </div>

          <Link
            href="/projects"
            className="rounded-2xl border px-4 py-3 text-sm hover:bg-slate-50"
          >
            {project ? "Change Project" : "Select Project"}
          </Link>
        </div>

        {hasProject && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatCard title="Open Issues" value={issueCounts.open} />
            <StatCard title="Issues Due 7 Days" value={issueCounts.due7} />
            <StatCard title="Schedule Open" value={scheduleCounts.open} />
          </div>
        )}
      </div>

      {/* FIELD LAUNCHER */}

      <div>
        <h2 className="text-lg font-semibold text-slate-900">Field Launcher</h2>
        <p className="text-sm text-slate-500">Big-tap tools for field work.</p>

        <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">

          <TileCard
            href={plansHref}
            icon="📐"
            title="Plans"
            value={hasProject ? planCounts.currentSheets : "—"}
            subtext="Current sheets"
            disabled={!hasProject}
            featured
          />

          <TileCard
            href={issuesHref}
            icon="⚠️"
            title="Field Issues"
            value={hasProject ? issueCounts.open : "—"}
            subtext="Open items"
            disabled={!hasProject}
            featured
          />

          <TileCard
            href={scheduleHref}
            icon="📅"
            title="Schedule"
            value={hasProject ? scheduleCounts.next7 : "—"}
            subtext="Next 7 days"
            disabled={!hasProject}
            featured
          />

          <TileCard
            href="/projects"
            icon="📦"
            title="Submittals"
            value="—"
            subtext="Coming soon"
            disabled
          />

          <TileCard
            href="/projects"
            icon="💰"
            title="Pay Apps"
            value="—"
            subtext="Coming soon"
            disabled
          />

        </div>
      </div>

    </div>
  );
}