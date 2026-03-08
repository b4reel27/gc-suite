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

function countIssues(items: any[]) {
  const now = Date.now();
  const openStatuses = new Set(["OPEN", "IN_PROGRESS", "DONE"]);

  const open = items.filter((i) => openStatuses.has(i.status));

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

  return { open: open.length, overdue: overdue.length, due7: due7.length };
}

function countSchedule(items: any[]) {
  const now = Date.now();

  const next7 = items.filter((i) => {
    const start = new Date(i.start_at || i.start_date || i.start || i.date || "").getTime();
    if (!Number.isFinite(start)) return false;
    return start >= now && start <= now + 7 * 24 * 60 * 60 * 1000;
  });

  return { next7: next7.length };
}

async function apiGet(path: string, token: string) {
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  let data: any = null;

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

export default function DashboardPage() {
  const [token, setToken] = useState("");
  const [activeProjectId, setActiveProjectId] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [issueItems, setIssueItems] = useState<any[]>([]);
  const [scheduleItems, setScheduleItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [debug, setDebug] = useState("");

  useEffect(() => {
    async function load() {
      const storedToken = getToken();
      const storedProjectId = getActiveProjectId();

      setToken(storedToken);
      setActiveProjectId(storedProjectId);

      if (!storedToken) {
        setDebug("No token found in localStorage.");
        setLoading(false);
        return;
      }

      const projectsRes = await apiGet("/projects", storedToken);

      if (!projectsRes.ok) {
        setDebug(
          `Projects request failed. Status: ${projectsRes.status}. Response: ${JSON.stringify(
            projectsRes.data
          )}`
        );
        setLoading(false);
        return;
      }

      const loadedProjects = Array.isArray(projectsRes.data) ? projectsRes.data : [];
      setProjects(loadedProjects);

      const activeProject =
        loadedProjects.find((p: any) => p.id === storedProjectId) || null;

      setProject(activeProject);

      if (storedProjectId) {
        const [issuesRes, scheduleRes] = await Promise.all([
          apiGet(`/projects/${storedProjectId}/punch`, storedToken),
          apiGet(`/schedule/${storedProjectId}`, storedToken),
        ]);

        if (issuesRes.ok && Array.isArray(issuesRes.data)) {
          setIssueItems(issuesRes.data);
        }

        if (scheduleRes.ok && Array.isArray(scheduleRes.data)) {
          setScheduleItems(scheduleRes.data);
        }

        if (!issuesRes.ok || !scheduleRes.ok) {
          setDebug(
            `Secondary load issue. Punch: ${issuesRes.status}, Schedule: ${scheduleRes.status}`
          );
        }
      }

      setLoading(false);
    }

    load();
  }, []);

  const issueCounts = useMemo(() => countIssues(issueItems), [issueItems]);
  const schedCounts = useMemo(() => countSchedule(scheduleItems), [scheduleItems]);

  const plansHref = activeProjectId ? `/projects/${activeProjectId}/plans` : "/projects";
  const issuesHref = activeProjectId ? `/projects/${activeProjectId}/punch` : "/projects";
  const scheduleHref = activeProjectId ? `/projects/${activeProjectId}/schedule` : "/projects";

  if (loading) {
    return <div className="p-6">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-slate-600">Debugging auth + project load.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <div><strong>API URL:</strong> {API_URL || "missing"}</div>
        <div><strong>Token present:</strong> {token ? "yes" : "no"}</div>
        <div><strong>Active Project ID:</strong> {activeProjectId || "none"}</div>
        <div><strong>Projects Loaded:</strong> {projects.length}</div>
        {debug ? <div className="mt-2 text-red-600"><strong>Debug:</strong> {debug}</div> : null}
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

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm text-slate-500">Open Issues</h2>
          <p className="mt-2 text-3xl font-semibold">{project ? issueCounts.open : "—"}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm text-slate-500">Overdue Issues</h2>
          <p className="mt-2 text-3xl font-semibold">{project ? issueCounts.overdue : "—"}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm text-slate-500">Issues Due 7 Days</h2>
          <p className="mt-2 text-3xl font-semibold">{project ? issueCounts.due7 : "—"}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm text-slate-500">Schedule Next 7 Days</h2>
          <p className="mt-2 text-3xl font-semibold">{project ? schedCounts.next7 : "—"}</p>
        </div>
      </div>
    </div>
  );
}