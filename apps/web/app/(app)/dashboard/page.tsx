"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MobileQuickActions from "../../../components/MobileQuickActions";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const ISSUE_ROUTE = "punch";

type Project = {
  id?: string;
  name?: string;
  location?: string;
};

type Issue = {
  id?: string;
  title?: string;
  description?: string;
  location?: string;
  trade?: string;
  status?: string;
  due_date?: string;
  created_at?: string;
  updated_at?: string;
  latest_photo_path?: string;
};

type ScheduleItem = {
  id?: string;
  title?: string;
  name?: string;
  location?: string;
  assigned_company?: string;
  start_date?: string;
  date?: string;
  start?: string;
  scheduled_at?: string;
};

type Photo = {
  id?: string;
  url?: string;
  file_url?: string;
  image_url?: string;
  path?: string;
  caption?: string;
  created_at?: string;
  uploaded_at?: string;
};

function getToken() {
  if (typeof window === "undefined") return "";

  const cookieVal = (name: string) =>
    document.cookie
      .split("; ")
      .find((c) => c.startsWith(name + "="))
      ?.split("=")
      .slice(1)
      .join("=") || "";

  return (
    decodeURIComponent(cookieVal("gc_token")) ||
    decodeURIComponent(cookieVal("gc_auth")) ||
    decodeURIComponent(cookieVal("gcToken")) ||
    decodeURIComponent(cookieVal("token")) ||
    localStorage.getItem("token") ||
    ""
  );
}

function getActiveProjectId() {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("activeProjectId") ||
    localStorage.getItem("projectId") ||
    ""
  );
}

function fmtDate(dateStr?: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusUpper(v?: string) {
  return String(v || "").trim().toUpperCase();
}

function prettyStatus(v?: string) {
  return statusUpper(v).replaceAll("_", " ");
}

function isOpenIssue(status?: string) {
  return ["OPEN", "IN_PROGRESS", "DONE"].includes(statusUpper(status));
}

function cardTone(type?: string) {
  if (type === "danger") return "border-red-200 bg-red-50 text-red-900";
  if (type === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  if (type === "good") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  return "border-slate-200 bg-white text-slate-900";
}

function statusPillTone(status?: string) {
  const s = statusUpper(status);
  if (s === "OPEN") return "bg-red-50 text-red-700 ring-red-200";
  if (s === "IN_PROGRESS") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (s === "VERIFIED") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (s === "DONE") return "bg-blue-50 text-blue-700 ring-blue-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function normalizeArrayResponse<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { items?: T[] }).items)
  ) {
    return (data as { items?: T[] }).items || [];
  }
  return [];
}

async function fetchJson<T>(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 15000
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers,
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function SectionShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px]">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-slate-900 sm:text-2xl">{value}</div>
    </div>
  );

  if (!href) return content;
  return <Link href={href}>{content}</Link>;
}

function AttentionRow({
  icon,
  text,
  tone = "default",
  href,
}: {
  icon: string;
  text: string;
  tone?: string;
  href?: string;
}) {
  const row = (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 ${cardTone(
        tone
      )}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-base">{icon}</span>
        <span className="text-sm font-medium">{text}</span>
      </div>
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide opacity-70">
        View
      </span>
    </div>
  );

  if (!href) return row;
  return <Link href={href}>{row}</Link>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
      {text}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle?: string;
  href?: string;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-slate-900 sm:text-lg">{title}</h2>
        {subtitle ? (
          <div className="mt-0.5 text-[11px] text-slate-500 sm:text-xs">
            {subtitle}
          </div>
        ) : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="shrink-0 text-xs font-semibold text-slate-600 transition hover:text-slate-900"
        >
          View all →
        </Link>
      ) : null}
    </div>
  );
}

function DarkPrimaryLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 ${className}`}
    >
      <span className="text-white">{children}</span>
    </Link>
  );
}

function LightSecondaryLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200 ${className}`}
    >
      <span className="text-inherit">{children}</span>
    </Link>
  );
}

export default function DashboardPage() {
  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const pid = getActiveProjectId();
    setProjectId(pid);

    if (!API_URL) {
      setError("NEXT_PUBLIC_API_URL is not set.");
      setLoading(false);
      return;
    }

    const token = getToken();
    if (!token) {
      setError("No auth token found.");
      setLoading(false);
      return;
    }

    if (!pid) {
      setError("No active project selected.");
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const results = await Promise.allSettled([
          fetchJson<Project[]>(`${API_URL}/projects`, headers),
          fetchJson<Issue[] | { items?: Issue[] }>(
            `${API_URL}/projects/${pid}/punch`,
            headers
          ),
          fetchJson<ScheduleItem[] | { items?: ScheduleItem[] }>(
            `${API_URL}/projects/${pid}/schedule`,
            headers
          ),
        ]);

        if (!isMounted) return;

        const [projectsResult, issuesResult, scheduleResult] = results;

        const projectsData =
          projectsResult.status === "fulfilled" ? projectsResult.value : [];
        const issuesData =
          issuesResult.status === "fulfilled" ? issuesResult.value : [];
        const scheduleData =
          scheduleResult.status === "fulfilled" ? scheduleResult.value : [];

        const activeProject = Array.isArray(projectsData)
          ? projectsData.find((p) => p.id === pid) || null
          : null;

        const normalizedIssues = normalizeArrayResponse<Issue>(issuesData);
        const normalizedSchedule = normalizeArrayResponse<ScheduleItem>(scheduleData);

        setProject(activeProject);
        setIssues(normalizedIssues);
        setScheduleItems(normalizedSchedule);

        setPhotos(
          normalizedIssues
            .filter((i) => i.latest_photo_path)
            .map((i, index) => ({
              id: i.id || `photo-${index}`,
              url: i.latest_photo_path,
              caption: i.title || i.description || "Issue photo",
              created_at: i.updated_at || i.created_at,
            }))
        );

        const failedMessages = results
          .filter((r): r is PromiseRejectedResult => r.status === "rejected")
          .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));

        if (!activeProject && failedMessages.length > 0) {
          setError(failedMessages[0]);
        }
      } catch (err) {
        console.error("Dashboard load error:", err);
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const now = new Date();

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const tomorrowStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const dayAfterTomorrowStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const openIssues = useMemo(
    () => issues.filter((i) => statusUpper(i.status) === "OPEN"),
    [issues]
  );

  const inProgressIssues = useMemo(
    () => issues.filter((i) => statusUpper(i.status) === "IN_PROGRESS"),
    [issues]
  );

  const verifiedIssues = useMemo(
    () => issues.filter((i) => statusUpper(i.status) === "VERIFIED"),
    [issues]
  );

  const overdueIssues = useMemo(() => {
    return issues.filter((i) => {
      if (!isOpenIssue(i.status) || !i.due_date) return false;
      const d = new Date(i.due_date);
      return !Number.isNaN(d.getTime()) && d < todayStart;
    });
  }, [issues, todayStart]);

  const dueTodayIssues = useMemo(() => {
    return issues.filter((i) => {
      if (!isOpenIssue(i.status) || !i.due_date) return false;
      const d = new Date(i.due_date);
      return !Number.isNaN(d.getTime()) && d >= todayStart && d < tomorrowStart;
    });
  }, [issues, todayStart, tomorrowStart]);

  const tomorrowSchedule = useMemo(() => {
    return scheduleItems.filter((s) => {
      const raw = s.start_date || s.date || s.start || s.scheduled_at;
      if (!raw) return false;
      const d = new Date(raw);
      return !Number.isNaN(d.getTime()) && d >= tomorrowStart && d < dayAfterTomorrowStart;
    });
  }, [scheduleItems, tomorrowStart, dayAfterTomorrowStart]);

  const upcomingSchedule = useMemo(() => {
    return [...scheduleItems]
      .filter((s) => {
        const raw = s.start_date || s.date || s.start || s.scheduled_at;
        if (!raw) return false;
        const d = new Date(raw);
        return !Number.isNaN(d.getTime()) && d >= now;
      })
      .sort((a, b) => {
        const da = new Date(
          a.start_date || a.date || a.start || a.scheduled_at || 0
        ).getTime();
        const db = new Date(
          b.start_date || b.date || b.start || b.scheduled_at || 0
        ).getTime();
        return da - db;
      })
      .slice(0, 5);
  }, [scheduleItems, now]);

  const recentIssues = useMemo(() => {
    return [...issues]
      .sort((a, b) => {
        const da = new Date(
          a.updated_at || a.created_at || a.due_date || 0
        ).getTime();
        const db = new Date(
          b.updated_at || b.created_at || b.due_date || 0
        ).getTime();
        return db - da;
      })
      .slice(0, 5);
  }, [issues]);

  const recentPhotos = useMemo(() => {
    return [...photos]
      .sort((a, b) => {
        const da = new Date(a.created_at || a.uploaded_at || 0).getTime();
        const db = new Date(b.created_at || b.uploaded_at || 0).getTime();
        return db - da;
      })
      .slice(0, 8);
  }, [photos]);

  const projectName = project?.name || "Project Dashboard";
  const projectLocation = project?.location || "";
  const allClear =
    overdueIssues.length === 0 &&
    dueTodayIssues.length === 0 &&
    tomorrowSchedule.length === 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-3 pb-32 pt-2 sm:px-6 sm:pt-4 lg:px-8">
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-2xl">
                {projectName}
              </h1>
              <div className="mt-0.5 truncate text-sm text-slate-500">
                {projectLocation || "Active project"}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <DarkPrimaryLink
                href={projectId ? `/projects/${projectId}/${ISSUE_ROUTE}` : "#"}
              >
                + Issue
              </DarkPrimaryLink>

              <LightSecondaryLink
                href={projectId ? `/projects/${projectId}/schedule` : "#"}
              >
                + Schedule
              </LightSecondaryLink>

              <LightSecondaryLink
                href={projectId ? `/projects/${projectId}/${ISSUE_ROUTE}` : "#"}
              >
                + Photo
              </LightSecondaryLink>

              <LightSecondaryLink
                href={projectId ? `/projects/${projectId}/daily-log` : "#"}
              >
                + Daily Log
              </LightSecondaryLink>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white" />
              <div className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-16 animate-pulse rounded-xl border border-slate-200 bg-white"
                />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-5">
            <SectionShell>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
                    Needs Attention
                  </h2>
                  <div className="mt-0.5 text-sm text-slate-500">
                    {allClear ? "All clear right now" : "Action now"}
                  </div>
                </div>

                {allClear ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    Clear
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                    Active
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <AttentionRow
                  icon="⚠️"
                  text={`${overdueIssues.length} overdue issue${
                    overdueIssues.length === 1 ? "" : "s"
                  }`}
                  tone={overdueIssues.length ? "danger" : "good"}
                  href={projectId ? `/projects/${projectId}/${ISSUE_ROUTE}` : "#"}
                />
                <AttentionRow
                  icon="📌"
                  text={`${dueTodayIssues.length} issue${
                    dueTodayIssues.length === 1 ? "" : "s"
                  } due today`}
                  tone={dueTodayIssues.length ? "warn" : "good"}
                  href={projectId ? `/projects/${projectId}/${ISSUE_ROUTE}` : "#"}
                />
                <AttentionRow
                  icon="📅"
                  text={`${tomorrowSchedule.length} schedule item${
                    tomorrowSchedule.length === 1 ? "" : "s"
                  } tomorrow`}
                  tone={tomorrowSchedule.length ? "default" : "good"}
                  href={projectId ? `/projects/${projectId}/schedule` : "#"}
                />
              </div>
            </SectionShell>

            <div className="grid gap-4 md:grid-cols-2">
              <SectionShell className="border-2 border-slate-200">
                <SectionHeader
                  title="Recent Issues"
                  subtitle="Latest field items logged"
                  href={projectId ? `/projects/${projectId}/${ISSUE_ROUTE}` : "#"}
                />

                <div className="space-y-3">
                  {recentIssues.length === 0 ? (
                    <EmptyState text="No issues yet." />
                  ) : (
                    recentIssues.map((issue, index) => (
                      <Link
                        key={issue.id || `issue-${index}`}
                        href={projectId ? `/projects/${projectId}/${ISSUE_ROUTE}` : "#"}
                        className="block rounded-xl border border-slate-300 bg-slate-50 p-3 shadow-sm transition hover:-translate-y-[1px] hover:bg-white hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="line-clamp-2 text-sm font-semibold text-slate-900 sm:text-base">
                              {issue.title || issue.description || "Untitled issue"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500 sm:text-sm">
                              {[issue.location, issue.trade]
                                .filter(Boolean)
                                .join(" • ") || "No location set"}
                            </div>
                          </div>

                          <div
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 sm:text-[11px] ${statusPillTone(
                              issue.status || "OPEN"
                            )}`}
                          >
                            {prettyStatus(issue.status || "OPEN")}
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 sm:text-xs">
                          <span>Due: {fmtDate(issue.due_date)}</span>
                          <span>{fmtDate(issue.updated_at || issue.created_at)}</span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </SectionShell>

              <SectionShell>
                <SectionHeader
                  title="Upcoming Schedule"
                  subtitle="What is coming next"
                  href={projectId ? `/projects/${projectId}/schedule` : "#"}
                />

                <div className="space-y-3">
                  {upcomingSchedule.length === 0 ? (
                    <EmptyState text="No upcoming schedule items." />
                  ) : (
                    upcomingSchedule.map((item, index) => {
                      const raw =
                        item.start_date || item.date || item.start || item.scheduled_at;

                      return (
                        <Link
                          key={item.id || `schedule-${index}`}
                          href={projectId ? `/projects/${projectId}/schedule` : "#"}
                          className="block rounded-xl border border-slate-300 bg-slate-50 p-3 shadow-sm transition hover:-translate-y-[1px] hover:bg-white hover:shadow-md"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="line-clamp-2 text-sm font-semibold text-slate-900 sm:text-base">
                                {item.title || item.name || "Untitled schedule item"}
                              </div>
                              <div className="mt-1 text-xs text-slate-500 sm:text-sm">
                                {[item.location, item.assigned_company]
                                  .filter(Boolean)
                                  .join(" • ") || "No location set"}
                              </div>
                            </div>

                            <div className="shrink-0 text-right text-[11px] font-semibold text-slate-500 sm:text-xs">
                              <div>{fmtDate(raw)}</div>
                              <div>{fmtTime(raw)}</div>
                            </div>
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>
              </SectionShell>
            </div>

            <SectionShell>
              <div className="mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                  Project Summary
                </h2>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Quick counts at a glance
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard
                  label="Open Issues"
                  value={openIssues.length}
                  href={projectId ? `/projects/${projectId}/${ISSUE_ROUTE}` : "#"}
                />
                <StatCard
                  label="In Progress"
                  value={inProgressIssues.length}
                  href={projectId ? `/projects/${projectId}/${ISSUE_ROUTE}` : "#"}
                />
                <StatCard
                  label="Verified"
                  value={verifiedIssues.length}
                  href={projectId ? `/projects/${projectId}/${ISSUE_ROUTE}` : "#"}
                />
                <StatCard
                  label="Photos"
                  value={photos.length}
                  href={projectId ? `/projects/${projectId}/${ISSUE_ROUTE}` : "#"}
                />
              </div>
            </SectionShell>

            <SectionShell>
              <SectionHeader
                title="Recent Photos"
                subtitle="Latest issue photos"
                href={projectId ? `/projects/${projectId}/${ISSUE_ROUTE}` : "#"}
              />

              {recentPhotos.length === 0 ? (
                <EmptyState text="No photos uploaded yet." />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {recentPhotos.map((photo, index) => {
                    const src =
                      photo.url ||
                      photo.file_url ||
                      photo.image_url ||
                      photo.path ||
                      "";

                    return (
                      <Link
                        key={photo.id || `photo-${index}`}
                        href={projectId ? `/projects/${projectId}/${ISSUE_ROUTE}` : "#"}
                        className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
                      >
                        {src ? (
                          <img
                            src={src}
                            alt={photo.caption || "Project photo"}
                            className="h-24 w-full object-cover transition duration-200 group-hover:scale-[1.02] sm:h-32"
                          />
                        ) : (
                          <div className="flex h-24 items-center justify-center text-sm text-slate-400 sm:h-32">
                            No preview
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </SectionShell>
          </div>
        )}
      </div>

      <MobileQuickActions
        actions={[
          {
            label: "New Issue",
            icon: "📸",
            href: projectId ? `/projects/${projectId}/${ISSUE_ROUTE}` : "#",
          },
          {
            label: "New Schedule",
            icon: "📅",
            href: projectId ? `/projects/${projectId}/schedule` : "#",
          },
          {
            label: "Add Photo",
            icon: "📷",
            href: projectId ? `/projects/${projectId}/${ISSUE_ROUTE}` : "#",
          },
          {
            label: "Daily Log",
            icon: "📝",
            href: projectId ? `/projects/${projectId}/daily-log` : "#",
          },
        ]}
        inset="bottom-5 right-4"
      />
    </div>
  );
}