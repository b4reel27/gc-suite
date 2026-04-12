"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ProjectHeader from "../../../../../components/ProjectHeader";

function getToken() {
  if (typeof document === "undefined") return "";

  const cookieVal = (name) =>
    document.cookie
      .split("; ")
      .find((c) => c.startsWith(name + "="))
      ?.split("=")
      .slice(1)
      .join("=") || "";

  const tok =
    cookieVal("gc_auth") ||
    cookieVal("gc_token") ||
    cookieVal("token") ||
    cookieVal("gcToken") ||
    "";

  if (tok) return decodeURIComponent(tok);
  return localStorage.getItem("token") || "";
}

function isGcRole(role) {
  return String(role || "").toUpperCase().startsWith("GC");
}

function statusUpper(s) {
  return String(s || "").toUpperCase();
}

function prettyStatus(status) {
  return statusUpper(status).replaceAll("_", " ");
}

function statusBadgeClass(status) {
  const s = statusUpper(status);

  if (s === "OPEN") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  if (s === "DONE") {
    return "bg-purple-100 text-purple-800 border-purple-200";
  }
  if (s === "VERIFIED") {
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  }
  if (s === "CANCELED") {
    return "bg-slate-200 text-slate-700 border-slate-300";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

function StatChip({ label, value, active, onClick }) {
  const base = "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition";
  return (
    <button
      onClick={onClick}
      className={`${base} ${active
        ? "border-slate-900 bg-slate-900 text-white shadow-sm"
        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span className="text-[11px] font-medium opacity-70">{label}</span>
      <span>{value}</span>
    </button>
  );
}

function fmtDate(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return String(value).slice(0, 10);
    return d.toLocaleDateString();
  } catch {
    return String(value).slice(0, 10);
  }
}

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined" && window?.location?.hostname) {
    return `http://${window.location.hostname}:3005`;
  }
  return "http://localhost:3005";
}

function cleanSpaces(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function titleCase(text) {
  return cleanSpaces(text)
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function formatTimeDisplay(raw) {
  const text = cleanSpaces(raw).toLowerCase();
  if (!text) return "";

  if (text === "morning") return "Morning";
  if (text === "afternoon") return "Afternoon";
  if (text === "evening") return "Evening";
  if (text === "noon") return "12:00 PM";

  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return titleCase(text);

  let hour = Number(match[1]);
  const minute = match[2] || "00";
  const suffix = match[3] ? match[3].toUpperCase() : "";

  if (suffix) {
    return `${hour}:${minute} ${suffix}`;
  }

  if (hour >= 1 && hour <= 7) {
    return `${hour}:${minute} AM`;
  }

  if (hour >= 8 && hour <= 11) {
    return `${hour}:${minute} AM`;
  }

  if (hour === 12) {
    return `12:${minute} PM`;
  }

  return `${hour}:${minute}`;
}

function resolveRelativeDate(keyword) {
  const lower = String(keyword || "").toLowerCase();
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (lower === "today") {
    return startOfToday.toISOString().slice(0, 10);
  }

  if (lower === "tomorrow") {
    const d = new Date(startOfToday);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  const days = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  if (lower in days) {
    const target = days[lower];
    const d = new Date(startOfToday);
    const current = d.getDay();
    let diff = target - current;
    if (diff < 0) diff += 7;
    if (diff === 0) diff = 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  return "";
}

function parseScheduleNote(note) {
  const original = cleanSpaces(note);
  const lower = original.toLowerCase();

  let detectedDateLabel = "";
  let detectedDateValue = "";
  let detectedTime = "";

  const dayKeywords = [
    "today",
    "tomorrow",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];

  for (const day of dayKeywords) {
    if (lower.includes(day)) {
      detectedDateLabel = titleCase(day);
      detectedDateValue = resolveRelativeDate(day);
      break;
    }
  }

  if (!detectedTime) {
    const timeWordMatch = original.match(/\b(morning|afternoon|evening|noon)\b/i);
    if (timeWordMatch) {
      detectedTime = formatTimeDisplay(timeWordMatch[0]);
    }
  }

  if (!detectedTime) {
    const timeMatch = original.match(/\b\d{1,2}(?::\d{2})?\s?(am|pm)?\b/i);
    if (timeMatch) {
      detectedTime = formatTimeDisplay(timeMatch[0]);
    }
  }

  let title = original;

  if (detectedDateLabel) {
    title = title.replace(new RegExp(detectedDateLabel, "i"), " ");
  }

  if (detectedTime) {
    const rawTimePattern =
      /\b(morning|afternoon|evening|noon|\d{1,2}(?::\d{2})?\s?(am|pm)?)\b/i;
    title = title.replace(rawTimePattern, " ");
  }

  title = cleanSpaces(title).replace(/^[-,]/, "").trim();
  title = titleCase(title || original);

  return {
    title,
    dateLabel: detectedDateLabel,
    dateValue: detectedDateValue,
    time: detectedTime,
  };
}

// ─── Gantt View ───────────────────────────────────────────────────────────────

const GANTT_STATUS_COLORS = {
  OPEN:     "#f59e0b",
  DONE:     "#a855f7",
  VERIFIED: "#10b981",
  CANCELED: "#94a3b8",
};

function GanttView({ items }) {
  const dated = items
    .map((it) => ({
      ...it,
      ds: new Date(it.start_at || it.date || it.due_date || null),
      de: new Date(it.end_at || it.due_date || it.start_at || it.date || null),
    }))
    .filter((it) => !isNaN(it.ds));

  if (dated.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
        No dated items to display on the Gantt.
      </div>
    );
  }

  const minDate = new Date(Math.min(...dated.map((i) => i.ds)));
  const maxDate = new Date(Math.max(...dated.map((i) => (isNaN(i.de) ? i.ds : i.de))));
  minDate.setDate(minDate.getDate() - 1);
  maxDate.setDate(maxDate.getDate() + 2);
  const totalDays = Math.max((maxDate - minDate) / 86400000, 1);

  function pct(date) {
    return Math.max(0, Math.min(100, ((date - minDate) / (maxDate - minDate)) * 100));
  }

  const monthLabels = [];
  const cursor = new Date(minDate);
  cursor.setDate(1);
  while (cursor <= maxDate) {
    monthLabels.push({
      label: cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      pct:   pct(cursor),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div style={{ minWidth: Math.max(600, totalDays * 14) + "px" }} className="p-4">
        {/* Month axis */}
        <div className="relative mb-3 h-5">
          {monthLabels.map((m) => (
            <span
              key={m.label + m.pct}
              className="absolute -translate-x-1/2 text-[10px] font-semibold text-slate-400"
              style={{ left: `${m.pct}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>
        {/* Rows */}
        <div className="space-y-2">
          {dated.map((it) => {
            const left = pct(it.ds);
            const right = pct(isNaN(it.de) || it.de <= it.ds ? new Date(+it.ds + 86400000) : it.de);
            const width = Math.max(right - left, 1.5);
            const color = GANTT_STATUS_COLORS[statusUpper(it.status)] || "#94a3b8";
            return (
              <div key={it.id} className="flex items-center gap-2">
                <div className="w-28 flex-shrink-0 truncate text-xs font-medium text-slate-700" title={it.title}>
                  {it.title}
                </div>
                <div className="relative flex-1" style={{ height: 24 }}>
                  <div className="absolute inset-y-0 w-full rounded-full bg-slate-100" />
                  <div
                    className="absolute inset-y-1 rounded-full"
                    style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
                    title={`${fmtDate(it.ds)} – ${fmtDate(isNaN(it.de) ? it.ds : it.de)}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3">
          {Object.entries(GANTT_STATUS_COLORS).map(([s, c]) => (
            <span key={s} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c }} />
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const { projectId } = useParams();

  const [items, setItems] = useState([]);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const [quickNote, setQuickNote] = useState("");
  const [quickParsingResult, setQuickParsingResult] = useState({
    title: "",
    dateLabel: "",
    dateValue: "",
    time: "",
  });
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState("list"); // "list" | "gantt"

  const apiBase = useMemo(() => getApiBase(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported =
      !!window.SpeechRecognition || !!window.webkitSpeechRecognition;
    setSpeechSupported(supported);
  }, []);

  useEffect(() => {
    setQuickParsingResult(parseScheduleNote(quickNote));
  }, [quickNote]);

  async function apiFetch(path, opts = {}) {
    const base = apiBase || getApiBase();
    const token = getToken();

    if (!token) {
      throw new Error("Not logged in (token missing). Go to Login and sign in again.");
    }

    const res = await fetch(`${base}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });

    const ct = res.headers.get("content-type") || "";

    if (!res.ok) {
      let message = `Request failed (${res.status})`;

      try {
        if (ct.includes("application/json")) {
          const data = await res.json();
          message = data?.error || JSON.stringify(data);
        } else {
          const txt = await res.text();
          if (txt) message = txt;
        }
      } catch {
        // ignore parse errors
      }

      throw new Error(message);
    }

    if (ct.includes("application/json")) return res.json();
    return null;
  }

  async function loadProjectMeta() {
    try {
      const projects = await apiFetch(`/projects`);
      const p = Array.isArray(projects) ? projects.find((x) => x.id === projectId) : null;
      if (p) {
        setProjectName(p.name || "");
        setProjectLocation(p.location || "");
      }
    } catch {
      // non-fatal
    }
  }

  async function refreshSchedule() {
    const res = await apiFetch(`/projects/${projectId}/schedule`);
    setItems(Array.isArray(res) ? res : res?.items || []);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      try {
        await loadProjectMeta();

        const meRes = await apiFetch(`/projects/${projectId}/me`);
        if (cancelled) return;
        setMe(meRes);

        await refreshSchedule();
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || "Error loading schedule");
      }
    }

    if (projectId) load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const iAmGC = isGcRole(me?.role);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter((it) => {
      const s = statusUpper(it.status);
      const statusOk = filter === "ALL" ? true : s === filter;
      const qOk = q
        ? `${it.title || ""} ${it.notes || ""} ${it.date || ""} ${it.start_at || ""}`
            .toLowerCase()
            .includes(q)
        : true;
      return statusOk && qOk;
    });
  }, [items, filter, query]);

  const stats = useMemo(() => {
    const list = items || [];
    return {
      total: list.length,
      open: list.filter((it) => statusUpper(it.status) === "OPEN").length,
      done: list.filter((it) => statusUpper(it.status) === "DONE").length,
      verified: list.filter((it) => statusUpper(it.status) === "VERIFIED").length,
      canceled: list.filter((it) => statusUpper(it.status) === "CANCELED").length,
    };
  }, [items]);

  function applyQuickParseToForm() {
    setNewTitle(quickParsingResult.title || "");
    setNewDate(quickParsingResult.dateValue || "");
    setNewNotes(quickParsingResult.time ? `Start time: ${quickParsingResult.time}` : "");
  }

  async function startSpeechToText() {
    try {
      const SpeechRecognition =
        typeof window !== "undefined" &&
        (window.SpeechRecognition || window.webkitSpeechRecognition);

      if (!SpeechRecognition) {
        setError("Speech recognition is not supported on this device/browser.");
        return;
      }

      setError("");
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);

      recognition.onerror = (event) => {
        setIsListening(false);
        setError(event?.error ? `Speech error: ${event.error}` : "Speech recognition failed");
      };

      recognition.onresult = (event) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || "";
        setQuickNote((prev) => cleanSpaces([prev, transcript].filter(Boolean).join(" ")));
      };

      recognition.start();
    } catch (e) {
      setIsListening(false);
      setError(e?.message || "Speech recognition failed");
    }
  }

  async function addItem(e) {
    e.preventDefault();
    setError("");

    try {
      const payload = {
        title: newTitle,
        date: newDate || null,
        notes: newNotes || null,
      };

      const created = await apiFetch(`/projects/${projectId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (created?.id) setItems((prev) => [created, ...(prev || [])]);
      else await refreshSchedule();

      setNewTitle("");
      setNewDate("");
      setNewNotes("");
      await refreshSchedule();
    } catch (e2) {
      setError(e2?.message || "Error creating schedule item");
    }
  }

  async function quickCreateItem() {
    setError("");

    const derivedTitle = quickParsingResult.title || cleanSpaces(quickNote);
    if (!derivedTitle) {
      setError("Enter or speak a quick schedule note first.");
      return;
    }

    setQuickAddBusy(true);

    try {
      const notesParts = [];
      if (quickParsingResult.time) {
        notesParts.push(`Start time: ${quickParsingResult.time}`);
      }

      const payload = {
        title: derivedTitle,
        date: quickParsingResult.dateValue || null,
        notes: notesParts.join(" ") || null,
      };

      await apiFetch(`/projects/${projectId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setQuickNote("");
      setQuickParsingResult({
        title: "",
        dateLabel: "",
        dateValue: "",
        time: "",
      });

      await refreshSchedule();
    } catch (e) {
      setError(e?.message || "Error creating quick schedule item");
    } finally {
      setQuickAddBusy(false);
    }
  }

  async function action(itemId, actionPath) {
    setError("");
    try {
      const updated = await apiFetch(`/schedule-item/${itemId}/${actionPath}`, {
        method: "POST",
      });

      if (updated?.id) {
        setItems((prev) => (prev || []).map((x) => (x.id === itemId ? updated : x)));
      } else {
        await refreshSchedule();
      }
    } catch (e) {
      setError(e?.message || "Error updating schedule item");
    }
  }

  async function deleteItem(itemId) {
    const ok = window.confirm("Delete this schedule item? This cannot be undone.");
    if (!ok) return;

    setError("");
    try {
      await apiFetch(`/schedule-item/${itemId}`, { method: "DELETE" });
      setItems((prev) => (prev || []).filter((x) => x.id !== itemId));
    } catch (e) {
      setError(e?.message || "Error deleting schedule item");
    }
  }

  function canDone(status) {
    const s = statusUpper(status);
    return s === "OPEN";
  }

  function canVerify(status) {
    const s = statusUpper(status);
    return s === "DONE";
  }

  function canCancel(status) {
    const s = statusUpper(status);
    return s !== "CANCELED";
  }

  return (
    <div className="space-y-4">
      <ProjectHeader projectName={projectName || "Project"} location={projectLocation || ""} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Schedule</h1>
          {me?.role ? (
            <p className="mt-1 text-sm text-slate-600">
              Role: <span className="font-semibold text-slate-900">{me.role}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              API: <span className="font-mono">{apiBase}</span>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={refreshSchedule}
          className="inline-flex w-fit items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <StatChip label="All"      value={stats.total}    active={filter === "ALL"}      onClick={() => setFilter("ALL")} />
        <StatChip label="Open"     value={stats.open}     active={filter === "OPEN"}     onClick={() => setFilter("OPEN")} />
        <StatChip label="Done"     value={stats.done}     active={filter === "DONE"}     onClick={() => setFilter("DONE")} />
        <StatChip label="Verified" value={stats.verified} active={filter === "VERIFIED"} onClick={() => setFilter("VERIFIED")} />
        <StatChip label="Canceled" value={stats.canceled} active={filter === "CANCELED"} onClick={() => setFilter("CANCELED")} />
      </div>

      {iAmGC ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-slate-900">Quick Add Schedule</h2>
            <p className="mt-1 text-sm text-slate-500">
              Speak or type a schedule note and let GC Suite prefill it.
            </p>
          </div>

          <div className="grid gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Quick Note</label>
              <textarea
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                rows={3}
                placeholder='Example: "Concrete pour Friday 7am"'
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startSpeechToText}
                disabled={!speechSupported || isListening}
                className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 ${
                  !speechSupported || isListening ? "cursor-not-allowed opacity-50" : ""
                }`}
              >
                {isListening ? "Listening..." : "🎤 Speak Schedule"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setQuickNote("");
                  setQuickParsingResult({
                    title: "",
                    dateLabel: "",
                    dateValue: "",
                    time: "",
                  });
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                Clear
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Detected Title
                </div>
                <div className="mt-2 text-sm font-medium text-slate-900">
                  {quickParsingResult.title || "—"}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Detected Date
                </div>
                <div className="mt-2 text-sm font-medium text-slate-900">
                  {quickParsingResult.dateLabel || "—"}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Detected Time
                </div>
                <div className="mt-2 text-sm font-medium text-slate-900">
                  {quickParsingResult.time || "—"}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={applyQuickParseToForm}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                Apply to Full Form
              </button>

              <button
                type="button"
                onClick={quickCreateItem}
                disabled={quickAddBusy}
                className={`rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:opacity-90 ${
                  quickAddBusy ? "cursor-not-allowed opacity-50" : ""
                }`}
              >
                {quickAddBusy ? "Saving..." : "Save Quick Schedule"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {iAmGC ? (
        <form onSubmit={addItem} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-slate-900">Add Schedule Item</h2>
            <p className="mt-1 text-sm text-slate-500">
              Add and manage upcoming field work.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-600">Task</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Example: Install new door hardware at front entry"
                required
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Date (optional)</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Notes (optional)</label>
              <input
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Example: Coordinate with locksmith"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                + Add Schedule Item
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          Schedule items can be viewed here, but only GC users can create, update, or delete them.
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-2">
        {["list", "gantt"].map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              viewMode === mode
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {mode === "list" ? "List" : "📅 Gantt"}
          </button>
        ))}
      </div>

      {viewMode === "gantt" ? (
        <GanttView items={filtered} />
      ) : null}

      {viewMode === "list" && (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Status</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="ALL">ALL</option>
              <option value="OPEN">OPEN</option>
              <option value="DONE">DONE</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="CANCELED">CANCELED</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Search</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, notes, date..."
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((it) => {
          const s = statusUpper(it.status);
          const displayDate = it.start_at || it.date || it.due_date || "";

          return (
            <div key={it.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-slate-900">{it.title}</div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                        s
                      )}`}
                    >
                      {prettyStatus(s)}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
                    {displayDate ? (
                      <span>
                        Date: <span className="font-medium text-slate-900">{fmtDate(displayDate)}</span>
                      </span>
                    ) : null}
                    {it.notes ? (
                      <span>
                        Notes: <span className="font-medium text-slate-900">{it.notes}</span>
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => action(it.id, "done")}
                    disabled={!iAmGC || !canDone(s)}
                    className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 ${
                      !iAmGC || !canDone(s) ? "opacity-40 cursor-not-allowed" : ""
                    }`}
                    type="button"
                    title={!iAmGC ? "GC only" : ""}
                  >
                    Done
                  </button>

                  <button
                    onClick={() => action(it.id, "verify")}
                    disabled={!iAmGC || !canVerify(s)}
                    className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 ${
                      !iAmGC || !canVerify(s) ? "opacity-40 cursor-not-allowed" : ""
                    }`}
                    type="button"
                    title={!iAmGC ? "GC only" : ""}
                  >
                    Verify
                  </button>

                  <button
                    onClick={() => action(it.id, "cancel")}
                    disabled={!iAmGC || !canCancel(s)}
                    className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 ${
                      !iAmGC || !canCancel(s) ? "opacity-40 cursor-not-allowed" : ""
                    }`}
                    type="button"
                    title={!iAmGC ? "GC only" : ""}
                  >
                    Cancel
                  </button>

                  {iAmGC ? (
                    <button
                      onClick={() => deleteItem(it.id)}
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 hover:bg-red-100"
                      type="button"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}

        {!filtered.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            No schedule items match your filters.
          </div>
        ) : null}
      </div>
      )}
    </div>
  );
}