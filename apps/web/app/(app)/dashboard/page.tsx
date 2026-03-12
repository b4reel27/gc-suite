"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

function getToken() {
  if (typeof window === "undefined") return "";

  const cookieVal = (name) =>
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

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusUpper(v) {
  return String(v || "").trim().toUpperCase();
}

function isOpenIssue(status) {
  return ["OPEN", "IN_PROGRESS", "DONE"].includes(statusUpper(status));
}

function cardTone(type) {
  if (type === "danger") {
    return "border-red-200 bg-red-50 text-red-900";
  }
  if (type === "warn") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  if (type === "good") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  return "border-slate-200 bg-white text-slate-900";
}

function StatCard({ label, value, href }) {
  const content = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
    </div>
  );

  if (!href) return content;

  return <Link href={href}>{content}</Link>;
}

function AttentionRow({ icon, text, tone = "default", href }) {
  const row = (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${cardTone(
        tone
      )}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-medium">{text}</span>
      </div>
      <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
        View
      </span>
    </div>
  );

  if (!href) return row;
  return <Link href={href}>{row}</Link>;
}

function EmptyState({ text }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
      {text}
    </div>
  );
}

export default function DashboardPage() {
  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState(null);
  const [issues, setIssues] = useState([]);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const pid = getActiveProjectId();
    setProjectId(pid);

    async function load() {
      const token = getToken();

      if (!API_URL) {
        setError("NEXT_PUBLIC_API_URL is not set.");
        setLoading(false);
        return;
      }

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

      try {
        setLoading(true);
        setError("");

        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const urls = [
          `${API_URL}/projects/${pid}`,
          `${API_URL}/projects/${pid}/issues`,
          `${API_URL}/projects/${pid}/schedule`,
          `${API_URL}/projects/${pid}/photos`,
        ];

        const [projectRes, issuesRes, scheduleRes, photosRes] =
          await Promise.all(
            urls.map((u) =>
              fetch(u, {
                headers,
                credentials: "include",
                cache: "no-store",
              })
            )
          );

        const parseJson = async (res, fallback = null) => {
          if (!res.ok) return fallback;
          try {
            return await res.json();
          } catch {
            return fallback;
          }
        };

        const projectData = await parseJson(projectRes, null);
        const issuesData = await parseJson(issuesRes, []);
        const scheduleData = await parseJson(scheduleRes, []);
        const photosData = await parseJson(photosRes, []);

        setProject(projectData || null);
        setIssues(Array.isArray(issuesData) ? issuesData : issuesData?.items || []);
        setScheduleItems(
          Array.isArray(scheduleData) ? scheduleData : scheduleData?.items || []
        );
        setPhotos(Array.isArray(photosData) ? photosData : photosData?.items || []);
      } catch (err) {
        setError(err?.message || "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    }

    load();
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
      return (
        !Number.isNaN(d.getTime()) &&
        d >= todayStart &&
        d < tomorrowStart
      );
    });
  }, [issues, todayStart, tomorrowStart]);

  const tomorrowSchedule = useMemo(() => {
    return scheduleItems.filter((s) => {
      const raw = s.start_date || s.date || s.start || s.scheduled_at;
      if (!raw) return false;
      const d = new Date(raw);
      return (
        !Number.isNaN(d.getTime()) &&
        d >= tomorrowStart &&
        d < dayAfterTomorrowStart
      );
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
        const da = new Date(a.start_date || a.date || a.start || a.scheduled_at);
        const db = new Date(b.start_date || b.date || b.start || b.scheduled_at);
        return da - db;
      })
      .slice(0, 5);
  }, [scheduleItems]);

  const recentIssues = useMemo(() => {
    return [...issues]
      .sort((a, b) => {
        const da = new Date(a.updated_at || a.created_at || a.due_date || 0);
        const db = new Date(b.updated_at || b.created_at || b.due_date || 0);
        return db - da;
      })
      .slice(0, 5);
  }, [issues]);

  const recentPhotos = useMemo(() => {
    return [...photos]
      .sort((a, b) => {
        const da = new Date(a.created_at || a.uploaded_at || 0);
        const db = new Date(b.created_at || b.uploaded_at || 0);
        return db - da;
      })
      .slice(0, 8);
  }, [photos]);

  const projectName = project?.name || "Project Dashboard";
  const projectLocation = project?.location || "";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6 lg:px-8">
        <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {projectName}
              </h1>
              <div className="mt-1 text-sm text-slate-500">
                {projectLocation || "Active project"}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={projectId ? `/projects/${projectId}/issues/new` : "#"}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm"
              >
                + Issue
              </Link>
              <Link
                href={projectId ? `/projects/${projectId}/schedule/new` : "#"}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
              >
                + Schedule
              </Link>
              <Link
                href={projectId ? `/projects/${projectId}/photos` : "#"}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
              >
                + Photo
              </Link>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white"
                />
              ))}
            </div>
            <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
              <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : (
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                label="Open Issues"
                value={openIssues.length}
                href={projectId ? `/projects/${projectId}/issues` : "#"}
              />
              <StatCard
                label="In Progress"
                value={inProgressIssues.length}
                href={projectId ? `/projects/${projectId}/issues` : "#"}
              />
              <StatCard
                label="Verified"
                value={verifiedIssues.length}
                href={projectId ? `/projects/${projectId}/issues` : "#"}
              />
              <StatCard
                label="Photos"
                value={photos.length}
                href={projectId ? `/projects/${projectId}/photos` : "#"}
              />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">
                  Needs Attention
                </h2>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Jobsite pulse
                </span>
              </div>

              <div className="space-y-3">
                <AttentionRow
                  icon="⚠️"
                  text={`${overdueIssues.length} overdue issue${
                    overdueIssues.length === 1 ? "" : "s"
                  }`}
                  tone={overdueIssues.length ? "danger" : "good"}
                  href={projectId ? `/projects/${projectId}/issues` : "#"}
                />
                <AttentionRow
                  icon="📌"
                  text={`${dueTodayIssues.length} issue${
                    dueTodayIssues.length === 1 ? "" : "s"
                  } due today`}
                  tone={dueTodayIssues.length ? "warn" : "good"}
                  href={projectId ? `/projects/${projectId}/issues` : "#"}
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
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900">
                    Recent Issues
                  </h2>
                  <Link
                    href={projectId ? `/projects/${projectId}/issues` : "#"}
                    className="text-sm font-semibold text-slate-600 hover:text-slate-900"
                  >
                    View all →
                  </Link>
                </div>

                <div className="space-y-3">
                  {recentIssues.length === 0 ? (
                    <EmptyState text="No issues yet." />
                  ) : (
                    recentIssues.map((issue) => (
                      <Link
                        key={issue.id}
                        href={projectId ? `/projects/${projectId}/issues` : "#"}
                        className="block rounded-xl border border-slate-200 p-4 transition hover:bg-slate-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">
                              {issue.title ||
                                issue.description ||
                                "Untitled issue"}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              {[issue.location, issue.trade]
                                .filter(Boolean)
                                .join(" • ") || "No location set"}
                            </div>
                          </div>
                          <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {statusUpper(issue.status || "OPEN").replaceAll("_", " ")}
                          </div>
                        </div>

                        <div className="mt-3 text-xs text-slate-400">
                          Due: {fmtDate(issue.due_date)}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900">
                    Upcoming Schedule
                  </h2>
                  <Link
                    href={projectId ? `/projects/${projectId}/schedule` : "#"}
                    className="text-sm font-semibold text-slate-600 hover:text-slate-900"
                  >
                    View all →
                  </Link>
                </div>

                <div className="space-y-3">
                  {upcomingSchedule.length === 0 ? (
                    <EmptyState text="No upcoming schedule items." />
                  ) : (
                    upcomingSchedule.map((item) => {
                      const raw =
                        item.start_date || item.date || item.start || item.scheduled_at;

                      return (
                        <Link
                          key={item.id}
                          href={projectId ? `/projects/${projectId}/schedule` : "#"}
                          className="block rounded-xl border border-slate-200 p-4 transition hover:bg-slate-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-900">
                                {item.title || item.name || "Untitled schedule item"}
                              </div>
                              <div className="mt-1 text-sm text-slate-500">
                                {[item.location, item.assigned_company]
                                  .filter(Boolean)
                                  .join(" • ") || "No location set"}
                              </div>
                            </div>
                            <div className="text-right text-xs font-semibold text-slate-500">
                              <div>{fmtDate(raw)}</div>
                              <div>{fmtTime(raw)}</div>
                            </div>
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Recent Photos</h2>
                <Link
                  href={projectId ? `/projects/${projectId}/photos` : "#"}
                  className="text-sm font-semibold text-slate-600 hover:text-slate-900"
                >
                  View all →
                </Link>
              </div>

              {recentPhotos.length === 0 ? (
                <EmptyState text="No photos uploaded yet." />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {recentPhotos.map((photo) => {
                    const src =
                      photo.url ||
                      photo.file_url ||
                      photo.image_url ||
                      photo.path ||
                      "";

                    return (
                      <Link
                        key={photo.id}
                        href={projectId ? `/projects/${projectId}/photos` : "#"}
                        className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                      >
                        {src ? (
                          <img
                            src={src}
                            alt={photo.caption || "Project photo"}
                            className="h-32 w-full object-cover transition group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                            No preview
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <div className="fixed bottom-5 right-5 z-30 md:hidden">
        <details className="group relative">
          <summary className="flex h-14 w-14 cursor-pointer list-none items-center justify-center rounded-full bg-slate-900 text-2xl font-bold text-white shadow-lg">
            +
          </summary>

          <div className="absolute bottom-16 right-0 w-48 space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
            <Link
              href={projectId ? `/projects/${projectId}/issues/new` : "#"}
              className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              📸 New Issue
            </Link>
            <Link
              href={projectId ? `/projects/${projectId}/schedule/new` : "#"}
              className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              📅 New Schedule
            </Link>
            <Link
              href={projectId ? `/projects/${projectId}/photos` : "#"}
              className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              📷 Add Photo
            </Link>
            <Link
              href={projectId ? `/projects/${projectId}/daily-log/new` : "#"}
              className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              📝 Daily Log
            </Link>
          </div>
        </details>
      </div>
    </div>
  );
}