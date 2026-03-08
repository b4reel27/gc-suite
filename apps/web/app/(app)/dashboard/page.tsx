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
    total: items.length,
    open: open.length,
    next7: next7.length,
  };
}

function countPlans(data) {
  const sheets = Array.isArray(data?.sheets) ? data.sheets : [];

  const totalSheets = sheets.length;
  const currentSheets = sheets.filter((s) => s?.current).length;

  return {
    totalSheets,
    currentSheets,
  };
}

async function apiGet(path, token) {
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
  };
}

function StatCard({ title, value, subtext }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm text-slate-500">{title}</h2>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      {subtext ? <p className="mt-2 text-xs text-slate-500">{subtext}</p> : null}
    </div>
  );
}

function TileCard({ href, icon, title, value, subtext, disabled = false }) {
  const baseClassName =
    "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition active:scale-[0.99]";
  const content = (
    <div className={disabled ? `${baseClassName} opacity-60` : `${baseClassName} hover:bg-slate-50`}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-3xl">{icon}</div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
          {value}
        </div>
      </div>
      <div className="mt-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtext ? <p className="mt-1 text-sm text-slate-500">{subtext}</p> : null}
      </div>
    </div>
  );

  if (disabled) {
    return content;
  }

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
  const [error, setError] = useState("");

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

      try {
        const projectsRes = await apiGet("/projects", token);

        if (!projectsRes.ok) {
          if (projectsRes.status === 401) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            localStorage.removeItem("activeProjectId");
            window.location.href = "/login";
            return;
          }
          throw new Error("Failed to load projects");
        }

        const loadedProjects = Array.isArray(projectsRes.data) ? projectsRes.data : [];
        setProjects(loadedProjects);

        const activeProject =
          loadedProjects.find((p) => p.id === storedProjectId) || null;
        setProject(activeProject);

        if (storedProjectId) {
          const [issuesRes, scheduleRes, plansRes] = await Promise.all([
            apiGet(`/projects/${storedProjectId}/punch`, token).catch(() => ({
              ok: false,
              status: 500,
              data: [],
            })),
            apiGet(`/schedule/${storedProjectId}`, token).catch(() => ({
              ok: false,
              status: 500,
              data: [],
            })),
            apiGet(`/projects/${storedProjectId}/plans`, token).catch(() => ({
              ok: false,
              status: 500,
              data: { sheets: [] },
            })),
          ]);

          if (issuesRes.ok && Array.isArray(issuesRes.data)) {
            setIssueItems(issuesRes.data);
          } else {
            setIssueItems([]);
          }

          if (scheduleRes.ok && Array.isArray(scheduleRes.data)) {
            setScheduleItems(scheduleRes.data);
          } else {
            setScheduleItems([]);
          }

          if (plansRes.ok) {
            setPlansData(plansRes.data || { sheets: [] });
          } else {
            setPlansData({ sheets: [] });
          }
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load dashboard.");
      }
    }

    load();
  }, []);

  const issueCounts = useMemo(() => countIssues(issueItems), [issueItems]);
  const scheduleCounts = useMemo(() => countSchedule(scheduleItems), [scheduleItems]);
  const planCounts = useMemo(() => countPlans(plansData), [plansData]);

  const plansHref = activeProjectId ? `/projects/${activeProjectId}/plans` : "/projects";
  const issuesHref = activeProjectId ? `/projects/${activeProjectId}/punch` : "/projects";
  const scheduleHref = activeProjectId ? `/projects/${activeProjectId}/schedule` : "/projects";
  const submittalsHref = activeProjectId
    ? `/projects/${activeProjectId}/submittals`
    : "/projects";
  const payAppsHref = activeProjectId
    ? `/projects/${activeProjectId}/pay-apps`
    : "/projects";

  if (!tokenReady) {
    return <div className="p-6">Loading...</div>;
  }

  const hasProject = !!project;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          {project ? (
            <p className="mt-1 text-slate-600">
              <span className="font-semibold">{project.name}</span>
              {project.location ? ` — ${project.location}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-slate-600">
              {projects.length
                ? "Select an active project to see live counts."
                : "No projects loaded yet."}
            </p>
          )}
        </div>

        <Link
          href="/projects"
          className="inline-flex w-fit items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          {project ? "Change Project" : "Select Project"}
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <TileCard
          href={plansHref}
          icon="📐"
          title="Plans"
          value={hasProject ? planCounts.currentSheets : "—"}
          subtext={
            hasProject
              ? `${planCounts.totalSheets} total sheet${planCounts.totalSheets === 1 ? "" : "s"}`
              : "Select project"
          }
          disabled={!hasProject}
        />

        <TileCard
          href={issuesHref}
          icon="⚠️"
          title="Field Issues"
          value={hasProject ? issueCounts.open : "—"}
          subtext="Open items"
          disabled={!hasProject}
        />

        <TileCard
          href={scheduleHref}
          icon="📅"
          title="Schedule"
          value={hasProject ? scheduleCounts.next7 : "—"}
          subtext="Next 7 days"
          disabled={!hasProject}
        />

        <TileCard
          href={submittalsHref}
          icon="📦"
          title="Submittals"
          value="—"
          subtext="Coming soon"
          disabled={!hasProject}
        />

        <TileCard
          href={payAppsHref}
          icon="💰"
          title="Pay Apps"
          value="—"
          subtext="Coming soon"
          disabled={!hasProject}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:opacity-90"
          href={plansHref}
        >
          Plans
        </Link>

        <Link
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          href={issuesHref}
        >
          Field Issues
        </Link>

        <Link
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          href={scheduleHref}
        >
          Schedule
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Open Issues"
          value={hasProject ? issueCounts.open : "—"}
          subtext="Open + in progress + done awaiting verify"
        />
        <StatCard
          title="Overdue Issues"
          value={hasProject ? issueCounts.overdue : "—"}
          subtext="Past due date"
        />
        <StatCard
          title="Issues Due 7 Days"
          value={hasProject ? issueCounts.due7 : "—"}
          subtext="Coming up this week"
        />
        <StatCard
          title="Schedule Open"
          value={hasProject ? scheduleCounts.open : "—"}
          subtext="Open schedule items"
        />
        <StatCard
          title="Schedule Next 7 Days"
          value={hasProject ? scheduleCounts.next7 : "—"}
          subtext="Upcoming work"
        />
        <StatCard
          title="Current Plans"
          value={hasProject ? planCounts.currentSheets : "—"}
          subtext={
            hasProject
              ? `${planCounts.totalSheets} total sheet${planCounts.totalSheets === 1 ? "" : "s"}`
              : "No active project"
          }
        />
      </div>

      {!project ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Go to{" "}
          <Link className="underline" href="/projects">
            Projects
          </Link>{" "}
          and set one active so your supers see real counts here.
        </div>
      ) : null}
    </div>
  );
}