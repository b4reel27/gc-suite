"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MobileQuickActions from "../../../components/MobileQuickActions";
import SmartCaptureModal from "../../../components/SmartCaptureModal";
import AIInsightsCard from "../../../components/AIInsightsCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const ISSUE_ROUTE = "punch";

type Project = { id?: string; name?: string; location?: string };
type Issue = {
  id?: string; title?: string; description?: string; location?: string;
  trade?: string; status?: string; due_date?: string;
  created_at?: string; updated_at?: string;
};
type ScheduleItem = {
  id?: string; title?: string; name?: string; location?: string;
  assigned_company?: string; start_date?: string; date?: string;
  start?: string; scheduled_at?: string; status?: string;
};

function getToken() {
  if (typeof window === "undefined") return "";
  const cookieVal = (name: string) =>
    document.cookie.split("; ").find((c) => c.startsWith(name + "="))
      ?.split("=").slice(1).join("=") || "";
  return (
    decodeURIComponent(cookieVal("gc_token")) ||
    decodeURIComponent(cookieVal("gc_auth")) ||
    localStorage.getItem("token") || ""
  );
}

function getActiveProjectId() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("activeProjectId") || localStorage.getItem("projectId") || "";
}

function fmtDate(dateStr?: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtTime(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function statusUpper(v?: string) { return String(v || "").trim().toUpperCase(); }
function prettyStatus(v?: string) { return statusUpper(v).replaceAll("_", " "); }

// ── Weather ───────────────────────────────────────────────────────────────────
type WeatherData = { temp: number; condition: string; icon: string; wind: number };

function wmoToCondition(code: number): { condition: string; icon: string } {
  if (code === 0) return { condition: "Clear", icon: "☀️" };
  if (code <= 2) return { condition: "Partly Cloudy", icon: "⛅" };
  if (code === 3) return { condition: "Overcast", icon: "☁️" };
  if (code <= 48) return { condition: "Foggy", icon: "🌫️" };
  if (code <= 55) return { condition: "Drizzle", icon: "🌦️" };
  if (code <= 65) return { condition: "Rain", icon: "🌧️" };
  if (code <= 75) return { condition: "Snow", icon: "❄️" };
  if (code <= 82) return { condition: "Showers", icon: "🌦️" };
  if (code <= 86) return { condition: "Snow Showers", icon: "🌨️" };
  return { condition: "Thunderstorm", icon: "⛈️" };
}

function useWeather() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherError, setWeatherError] = useState("");

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords;
          const url =
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,weather_code,wind_speed_10m` +
            `&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=1`;
          const res = await fetch(url, { cache: "no-store" });
          const data = await res.json();
          const cur = data?.current;
          if (!cur) return;
          const { condition, icon } = wmoToCondition(cur.weather_code ?? 0);
          setWeather({
            temp: Math.round(cur.temperature_2m),
            condition,
            icon,
            wind: Math.round(cur.wind_speed_10m),
          });
        } catch {
          setWeatherError("unavailable");
        }
      },
      () => setWeatherError("denied"),
      { timeout: 8000 }
    );
  }, []);

  return { weather, weatherError };
}

function isOpenIssue(status?: string) {
  return ["OPEN", "IN_PROGRESS"].includes(statusUpper(status));
}

function statusPillClass(status?: string) {
  const s = statusUpper(status);
  if (s === "OPEN") return "bg-red-50 text-red-700 ring-red-200";
  if (s === "IN_PROGRESS") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (s === "VERIFIED") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (s === "DONE") return "bg-blue-50 text-blue-700 ring-blue-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function normalizeArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as { items?: T[] }).items))
    return (data as { items: T[] }).items;
  return [];
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

export default function DashboardPage() {
  const { weather } = useWeather();

  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCapture, setShowCapture] = useState(false);

  useEffect(() => {
    const pid = getActiveProjectId();
    setProjectId(pid);
    if (!API_URL || !pid) { setLoading(false); return; }

    const token = getToken();
    if (!token) { setLoading(false); return; }

    const headers = { Authorization: `Bearer ${token}` };

    Promise.allSettled([
      fetchJson<Project[]>(`${API_URL}/projects`, headers),
      fetchJson<Issue[]>(`${API_URL}/projects/${pid}/punch`, headers),
      fetchJson<ScheduleItem[]>(`${API_URL}/projects/${pid}/schedule`, headers),
    ]).then(([pr, ir, sr]) => {
      if (pr.status === "fulfilled") {
        const list = normalizeArray<Project>(pr.value);
        setProject(list.find((p) => p.id === pid) || null);
      }
      if (ir.status === "fulfilled") setIssues(normalizeArray<Issue>(ir.value));
      if (sr.status === "fulfilled") setScheduleItems(normalizeArray<ScheduleItem>(sr.value));
      setLoading(false);
    }).catch(() => { setError("Failed to load."); setLoading(false); });
  }, []);

  // ── Date helpers ──────────────────────────────────────────────────────────
  const now = new Date();
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const tomorrowStart = useMemo(() => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(0,0,0,0); return d; }, []);

  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // ── Derived data ──────────────────────────────────────────────────────────
  const todaySchedule = useMemo(() =>
    scheduleItems.filter((s) => {
      const raw = s.start_date || s.date || s.start || s.scheduled_at;
      if (!raw) return false;
      const d = new Date(raw);
      return !Number.isNaN(d.getTime()) && d >= todayStart && d < tomorrowStart;
    }), [scheduleItems, todayStart, tomorrowStart]);

  const openIssues = useMemo(() => issues.filter((i) => statusUpper(i.status) === "OPEN"), [issues]);
  const inProgressIssues = useMemo(() => issues.filter((i) => statusUpper(i.status) === "IN_PROGRESS"), [issues]);
  const verifiedIssues = useMemo(() => issues.filter((i) => statusUpper(i.status) === "VERIFIED"), [issues]);

  const overdueIssues = useMemo(() => issues.filter((i) => {
    if (!isOpenIssue(i.status) || !i.due_date) return false;
    return new Date(i.due_date) < todayStart;
  }), [issues, todayStart]);

  const dueTodayIssues = useMemo(() => issues.filter((i) => {
    if (!isOpenIssue(i.status) || !i.due_date) return false;
    const d = new Date(i.due_date);
    return d >= todayStart && d < tomorrowStart;
  }), [issues, todayStart, tomorrowStart]);

  const recentIssues = useMemo(() =>
    [...issues]
      .filter((i) => isOpenIssue(i.status))
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
      .slice(0, 6),
    [issues]);

  const allClear = overdueIssues.length === 0 && dueTodayIssues.length === 0;
  const projectName = project?.name || "—";
  const projectLocation = project?.location || "";

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="text-4xl">📋</div>
        <div>
          <div className="text-lg font-bold text-slate-900">No project selected</div>
          <div className="mt-1 text-sm text-slate-500">Choose a project to see today&apos;s dashboard</div>
        </div>
        <Link href="/projects" className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
          Go to Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">

      {/* ── Date + Project Banner ── */}
      <div className="rounded-2xl bg-slate-900 p-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-slate-400">{dayName}</div>
            <div className="mt-0.5 text-2xl font-extrabold tracking-tight">{monthDay}</div>
          </div>
          {weather ? (
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-2xl leading-none">{weather.icon}</span>
                <span className="text-2xl font-extrabold">{weather.temp}°</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-400">{weather.condition}</div>
              <div className="text-xs text-slate-500">{weather.wind} mph wind</div>
            </div>
          ) : (
            <div className="text-right text-xs text-slate-500">
              <div>Weather</div>
              <div className="text-slate-600">Allow location</div>
            </div>
          )}
        </div>
        <div className="mt-3 border-t border-slate-700 pt-3">
          <div className="text-base font-bold">{projectName}</div>
          {projectLocation ? <div className="text-sm text-slate-400">{projectLocation}</div> : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/projects/${projectId}/${ISSUE_ROUTE}`}
            className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-500 hover:bg-slate-800">
            + Work to Complete
          </Link>
          <Link href={`/projects/${projectId}/daily-log`}
            className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-500 hover:bg-slate-800">
            Daily Log
          </Link>
          <Link href={`/projects/${projectId}/rfis`}
            className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-500 hover:bg-slate-800">
            + RFI
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((n) => (
            <div key={n} className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : (
        <>
          {/* ── Today's Schedule ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">On the Board Today</h2>
              <Link href={`/projects/${projectId}/schedule`}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900">
                View all →
              </Link>
            </div>
            {todaySchedule.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                Nothing scheduled for today.{" "}
                <Link href={`/projects/${projectId}/schedule`} className="font-semibold text-slate-700 underline">
                  Add an item
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {todaySchedule.map((item, i) => {
                  const raw = item.start_date || item.date || item.start || item.scheduled_at;
                  const s = statusUpper(item.status);
                  return (
                    <Link key={item.id || i} href={`/projects/${projectId}/schedule`}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:bg-white hover:shadow-sm">
                      <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${s === "DONE" || s === "VERIFIED" ? "bg-emerald-500" : "bg-amber-400"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {item.title || item.name || "Schedule item"}
                        </div>
                        {(item.location || item.assigned_company) ? (
                          <div className="text-xs text-slate-500">
                            {[item.location, item.assigned_company].filter(Boolean).join(" · ")}
                          </div>
                        ) : null}
                      </div>
                      {raw ? <div className="shrink-0 text-xs font-medium text-slate-500">{fmtTime(raw)}</div> : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Needs Attention ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Needs Attention</h2>
              <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ring-1 ${
                allClear ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"
              }`}>
                {allClear ? "All clear" : "Action needed"}
              </span>
            </div>
            <div className="space-y-2">
              <Link href={`/projects/${projectId}/${ISSUE_ROUTE}`}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 transition hover:shadow-sm ${
                  overdueIssues.length ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"
                }`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{overdueIssues.length ? "⚠️" : "✓"}</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {overdueIssues.length
                      ? `${overdueIssues.length} overdue item${overdueIssues.length !== 1 ? "s" : ""}`
                      : "No overdue items"}
                  </span>
                </div>
                <span className="text-xs font-semibold text-slate-400">View →</span>
              </Link>

              <Link href={`/projects/${projectId}/${ISSUE_ROUTE}`}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 transition hover:shadow-sm ${
                  dueTodayIssues.length ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"
                }`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{dueTodayIssues.length ? "📌" : "✓"}</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {dueTodayIssues.length
                      ? `${dueTodayIssues.length} item${dueTodayIssues.length !== 1 ? "s" : ""} due today`
                      : "Nothing due today"}
                  </span>
                </div>
                <span className="text-xs font-semibold text-slate-400">View →</span>
              </Link>
            </div>
          </div>

          {/* ── Open Issues ── */}
          {recentIssues.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-slate-900">Work to Complete</h2>
                <div className="flex items-center gap-2">
                  {openIssues.length > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600 ring-1 ring-red-200">{openIssues.length} open</span>}
                  {inProgressIssues.length > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600 ring-1 ring-amber-200">{inProgressIssues.length} active</span>}
                  <Link href={`/projects/${projectId}/${ISSUE_ROUTE}`} className="text-xs font-semibold text-slate-500 hover:text-slate-900">View all →</Link>
                </div>
              </div>
              <div className="space-y-2">
                {recentIssues.map((issue, i) => (
                  <Link key={issue.id || i} href={`/projects/${projectId}/${ISSUE_ROUTE}`}
                    className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {issue.title || issue.description || "Untitled"}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {[issue.trade, issue.location].filter(Boolean).join(" · ") || "No location"}
                        {issue.due_date ? ` · Due ${fmtDate(issue.due_date)}` : ""}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ${statusPillClass(issue.status)}`}>
                      {prettyStatus(issue.status || "OPEN")}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}

      <AIInsightsCard projectId={getActiveProjectId()} />
          <MobileQuickActions
        actions={[
          { label: "Smart Capture", icon: "✨", highlight: true, onClick: () => setShowCapture(true) },
          { label: "Work to Complete", icon: "📸", href: projectId ? `/projects/${projectId}/${ISSUE_ROUTE}` : "#" },
          { label: "Daily Log", icon: "📝", href: projectId ? `/projects/${projectId}/daily-log` : "#" },
          { label: "New JSA", icon: "🦺", href: projectId ? `/projects/${projectId}/forms` : "#" },
          { label: "Schedule", icon: "📅", href: projectId ? `/projects/${projectId}/schedule` : "#" },
        ]}
        inset="bottom-5 right-4"
      />
      {showCapture && projectId && (
        <SmartCaptureModal
          projectId={projectId}
          onClose={() => setShowCapture(false)}
        />
      )}
    </div>
  );
}
