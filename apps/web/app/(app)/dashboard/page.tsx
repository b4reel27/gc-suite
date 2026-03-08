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

function countSchedule(items) {
  const now = Date.now();

  const next7 = items.filter((i) => {
    const start = new Date(i.start_at || i.start_date || i.start || i.date || "").getTime();
    if (!Number.isFinite(start)) return false;
    return start >= now && start <= now + 7 * 24 * 60 * 60 * 1000;
  });

  return { next7: next7.length };
}

async function apiGet(path, token) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (res.status === 401) {
    throw new Error("unauthorized");
  }

  if (!res.ok) {
    throw new Error("request_failed");
  }

  return res.json();
}

export default function Dashboard() {
  const [tokenReady, setTokenReady] = useState(false);
  const [project, setProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [issueItems, setIssueItems] = useState([]);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState("");
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
        const loadedProjects = await apiGet("/projects", token);
        setProjects(loadedProjects || []);

        const activeProject =
          loadedProjects.find((p) => p.id === storedProjectId) || null;
        setProject(activeProject);

        if (storedProjectId) {
          const [issues, schedule] = await Promise.all([
            apiGet(`/projects/${storedProjectId}/punch`, token).catch(() => []),
            apiGet(`/schedule/${storedProjectId}`, token).catch(() => []),
          ]);

          setIssueItems(issues || []);
          setScheduleItems(schedule || []);
        }
      } catch (err) {
        if (err.message === "unauthorized") {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          window.location.href = "/login";
          return;
        }
        setError("Failed to load dashboard.");
      }
    }

    load();
  }, []);

  const issueCounts = useMemo(() => countIssues(issueItems), [issueItems]);
  const schedCounts = useMemo(() => countSchedule(scheduleItems), [scheduleItems]);

  const plansHref = activeProjectId ? `/projects/${activeProjectId}/plans` : "/projects";
  const issuesHref = activeProjectId ? `/projects/${activeProjectId}/punch` : "/projects";
  const scheduleHref = activeProjectId ? `/projects/${activeProjectId}/schedule` : "/projects";

  if (!tokenReady) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          {project ? (
            <p className="mt-1 text-slate-600">
              <span className="font-semibold">{project.name}</span>
              {project.location ? ` — ${project.location}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-slate-600">
              Select a project to see status + shortcuts.
            </p>
          )}
        </div>

        <Link
          href="/projects"
          className="inline-flex w-fit items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
        >
          {project ? "Change Project" : "Select Project"}
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

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

        <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400">
          RFIs (soon)
        </span>

        <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400">
          Submittals (soon)
        </span>
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

      {!project ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Go to{" "}
          <Link className="underline" href="/projects">
            Projects
          </Link>{" "}
          and open one.
        </div>
      ) : null}
    </div>
  );
}