import Link from "next/link";
import { cookies, headers } from "next/headers";

async function getApiUrl() {
  const hdrs = await headers();
  const host = hdrs.get("host")?.split(":")[0];
  return process.env.NEXT_PUBLIC_API_URL || (host ? `http://${host}:3005` : "");
}

async function apiGet(path: string, token: string) {
  const apiUrl = await getApiUrl();
  if (!apiUrl || !token) return null;

  const res = await fetch(`${apiUrl}${path}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  return res.json();
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
    const start = new Date(i.start_date || i.start || i.date || "").getTime();
    if (!Number.isFinite(start)) return false;
    return start >= now && start <= now + 7 * 24 * 60 * 60 * 1000;
  });

  return { next7: next7.length };
}

export default async function Dashboard() {
  const cookieStore = await cookies();
  const activeProjectId = cookieStore.get("activeProjectId")?.value || null;
  const token = cookieStore.get("gc_auth")?.value || "";

  const projects = (await apiGet("/projects", token)) || [];
  const project = activeProjectId
    ? projects.find((p: any) => p.id === activeProjectId)
    : null;

  const issueItems = activeProjectId
    ? (await apiGet(`/projects/${activeProjectId}/punch`, token)) || []
    : [];

  const scheduleItems = activeProjectId
    ? (await apiGet(`/schedule/${activeProjectId}`, token)) || []
    : [];

  const issueCounts = countIssues(issueItems);
  const schedCounts = countSchedule(scheduleItems);

  const plansHref = activeProjectId ? `/projects/${activeProjectId}/plans` : "/projects";
  const issuesHref = activeProjectId ? `/projects/${activeProjectId}/punch` : "/projects";
  const scheduleHref = activeProjectId ? `/projects/${activeProjectId}/schedule` : "/projects";

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