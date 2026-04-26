"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import ProjectHeader from "../../../../../components/ProjectHeader";

// ─── Utilities ────────────────────────────────────────────────────────────────

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
    cookieVal("gc_auth") || cookieVal("gc_token") || cookieVal("token") || cookieVal("gcToken") || "";
  if (tok) return decodeURIComponent(tok);
  return localStorage.getItem("token") || "";
}

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined" && window?.location?.hostname)
    return `http://${window.location.hostname}:3005`;
  return "http://localhost:3005";
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function entryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function prettyTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hh = parseInt(h, 10);
  const ampm = hh >= 12 ? "PM" : "AM";
  return `${hh % 12 || 12}:${m} ${ampm}`;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-[28px] border border-black/10 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
      {children}
    </div>
  );
}

function InputRow({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

// ─── Entry Card ───────────────────────────────────────────────────────────────

function EntryCard({ entry, apiBase, onDelete }) {
  const icon =
    entry.type === "photo" ? "📷" : entry.type === "voice" ? "🎙️" : "📝";

  const photoUrl =
    entry.type === "photo" && entry.file_path
      ? `${apiBase}/${entry.file_path}`
      : null;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center gap-1">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-black/10 bg-slate-50 text-base">
          {icon}
        </div>
        <div className="w-px flex-1 bg-slate-100" />
      </div>
      <div className="relative mb-4 min-w-0 flex-1 rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
        {onDelete && (
          <button
            onClick={onDelete}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-slate-300 transition hover:bg-red-50 hover:text-red-500"
            title="Delete entry"
          >
            ✕
          </button>
        )}
        <div className="mb-1 text-[11px] font-semibold text-slate-400">
          {prettyTime(entry.time)}
          {entry.type === "voice" ? " · Voice memo" : entry.type === "photo" ? " · Photo" : ""}
        </div>
        {entry.type === "photo" && photoUrl && (
          <img
            src={photoUrl}
            alt={entry.caption || "Photo"}
            className="mb-2 max-h-48 w-full rounded-xl object-cover"
          />
        )}
        {(entry.content || entry.caption) && (
          <p className="pr-5 text-sm leading-relaxed text-slate-800">
            {entry.content || entry.caption}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Voice Recorder ───────────────────────────────────────────────────────────

function VoiceRecorder({ onSave, onCancel }) {
  const recognitionRef = useRef(null);
  const accumulatedRef = useRef("");
  const activeRef      = useRef(false); // imperative flag — avoids stale closures
  const restartTimer   = useRef(null);

  const [active, setActive]     = useState(false);
  const [display, setDisplay]   = useState("");
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) setSupported(false);
    // Cleanup on unmount
    return () => {
      activeRef.current = false;
      clearTimeout(restartTimer.current);
      recognitionRef.current?.abort();
    };
  }, []);

  function startSession() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !activeRef.current) return;

    const rec = new SR();
    // continuous:false + interimResults:false = one utterance per session,
    // final result only — fixes Android Chrome double-capture bug
    rec.continuous     = false;
    rec.interimResults = false;
    rec.lang           = "en-US";
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript || "";
      if (transcript) {
        accumulatedRef.current = (accumulatedRef.current + " " + transcript).trim();
        setDisplay(accumulatedRef.current);
      }
    };

    rec.onend = () => {
      // Auto-restart so the user can keep speaking hands-free
      if (activeRef.current) {
        restartTimer.current = setTimeout(startSession, 150);
      }
    };

    rec.onerror = (e) => {
      // no-speech / audio-capture are non-fatal on mobile — just restart
      if (activeRef.current && (e.error === "no-speech" || e.error === "audio-capture")) {
        restartTimer.current = setTimeout(startSession, 300);
      } else {
        activeRef.current = false;
        setActive(false);
      }
    };

    recognitionRef.current = rec;
    try { rec.start(); } catch { /* ignore start() if already running */ }
  }

  function startRecording() {
    accumulatedRef.current = "";
    setDisplay("");
    activeRef.current = true;
    setActive(true);
    startSession();
  }

  function stopRecording() {
    activeRef.current = false;
    clearTimeout(restartTimer.current);
    recognitionRef.current?.stop();
    setActive(false);
  }

  function save() {
    const transcript = accumulatedRef.current.trim() || display.trim();
    if (transcript) onSave(transcript);
  }

  if (!supported) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          Voice recording requires Chrome or Edge. Please use a text note instead.
        </p>
        <button
          onClick={onCancel}
          className="mt-3 rounded-2xl border border-black/10 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <SectionLabel>Voice Memo</SectionLabel>

      {/* Transcript display */}
      <div className="mb-4 min-h-[80px] rounded-2xl border border-black/10 bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
        {display || (
          <span className="text-slate-400">
            {active ? "Listening… speak now" : "Tap the mic to start"}
          </span>
        )}
      </div>

      {/* Recording button */}
      <div className="mb-4 flex justify-center">
        <button
          onClick={active ? stopRecording : startRecording}
          className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl shadow-lg transition ${
            active
              ? "animate-pulse bg-red-500 text-white"
              : "bg-slate-900 text-white hover:bg-slate-800"
          }`}
        >
          {active ? "⏹" : "🎙️"}
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-2xl border border-black/10 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!display.trim()}
          className="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          Save Memo
        </button>
      </div>
    </Card>
  );
}

// ─── Entry parser — auto-fills compile fields from logged entries ─────────────

function parseEntriesForSummary(entries) {
  const texts = entries
    .filter((e) => e.content || e.caption)
    .map((e) => (e.content || e.caption || "").trim())
    .filter(Boolean);

  if (!texts.length) return { weather: "", manpower_count: "", manpower_detail: "", narrative: "" };

  const all = texts.join(" ");

  // Weather — find first entry mentioning weather-related terms
  let weather = "";
  const wxRx = /rain|sunny|sun|clear|cloud|hot|cold|wind|storm|thunder|fog|humid|overcast|\d+\s*°|\d+\s*degree/i;
  for (const t of texts) {
    if (wxRx.test(t)) { weather = t.length > 80 ? t.slice(0, 80) + "…" : t; break; }
  }

  // Manpower count — "12 guys on site", "18 men", "6 workers", etc.
  let manpower_count = "";
  const mpRx = /\b(\d{1,3})\s*(guys?|men|man|workers?|people|crew|hands?|personnel|total|on[\s-]?site)\b/i;
  const mpMatch = all.match(mpRx);
  if (mpMatch) manpower_count = mpMatch[1];

  // Trades breakdown — "5 electricians", "concrete 3", "4 framers", etc.
  const tradeMap = {};
  const TRADES = "electrician|plumber|concrete|framer|carpenter|hvac|mechanical|steel|rebar|drywall|painter|laborer|mason|tile|roofer|glass|finish|surveyor|inspector|landscap|demo|excavat";
  const rx1 = new RegExp(`\\b(\\d+)\\s*(${TRADES})[a-z]*`, "gi");
  const rx2 = new RegExp(`(${TRADES})[a-z]*\\s+(\\d+)`, "gi");
  let m;
  while ((m = rx1.exec(all)) !== null) {
    const k = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
    tradeMap[k] = m[1];
  }
  while ((m = rx2.exec(all)) !== null) {
    const k = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    if (!tradeMap[k]) tradeMap[k] = m[2];
  }
  const manpower_detail = Object.entries(tradeMap)
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");

  // Narrative — join all entry text into a readable summary
  const narrative = texts
    .slice(0, 10)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1).replace(/\.?\s*$/, ""))
    .join(". ")
    .slice(0, 700);

  return { weather, manpower_count, manpower_detail, narrative };
}

// ─── Compile Screen ───────────────────────────────────────────────────────────

function CompileScreen({ log, apiBase, onDone, onBack }) {
  // Pre-fill from log entries; user can edit freely before finalizing
  const [parsed] = useState(() => parseEntriesForSummary(
    Array.isArray(log.entries) ? log.entries : []
  ));

  const [weather, setWeather]         = useState(log.weather         || parsed.weather);
  const [manpowerCount, setMpCount]   = useState(log.manpower_count  != null ? String(log.manpower_count) : parsed.manpower_count);
  const [manpowerDetail, setMpDetail] = useState(log.manpower_detail || parsed.manpower_detail);
  const [narrative, setNarrative]     = useState(log.narrative       || parsed.narrative);

  // {[entryId]: 'issue' | 'schedule' | 'tomorrow' | null}
  const [tags, setTags] = useState({});

  // {[entryId]: {title, location, trade}}
  const [issueForms, setIssueForms] = useState({});

  // {[entryId]: {title, due_date, notes}}
  const [scheduleForms, setScheduleForms] = useState({});

  // Manual checklist items (in addition to 'tomorrow'-tagged entries)
  const [checkItems, setCheckItems] = useState([""]);

  const [compiling, setCompiling] = useState(false);
  const [error, setError]         = useState("");
  const [result, setResult]       = useState(null);

  const entries = Array.isArray(log.entries) ? log.entries : [];

  function setTag(id, tag) {
    setTags((p) => ({ ...p, [id]: p[id] === tag ? null : tag }));
  }

  function setIssueField(id, field, value) {
    setIssueForms((p) => ({ ...p, [id]: { ...(p[id] || {}), [field]: value } }));
  }

  function setScheduleField(id, field, value) {
    setScheduleForms((p) => ({ ...p, [id]: { ...(p[id] || {}), [field]: value } }));
  }

  function addCheckItem() {
    setCheckItems((p) => [...p, ""]);
  }

  function setCheckItem(i, v) {
    setCheckItems((p) => p.map((x, idx) => (idx === i ? v : x)));
  }

  async function apiFetch(path, opts = {}) {
    const token = getToken();
    const res = await fetch(`${apiBase}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
    if (!res.ok) {
      let msg = `Error ${res.status}`;
      try { const d = await res.json(); msg = d?.error || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  }

  async function handleCompile() {
    setCompiling(true);
    setError("");
    try {
      // Build tomorrow checklist
      const tomorrowFromEntries = entries
        .filter((e) => tags[e.id] === "tomorrow")
        .map((e) => e.content || e.caption || "Note");

      const tomorrow_checklist = [
        ...tomorrowFromEntries,
        ...checkItems.map((x) => x.trim()).filter(Boolean),
      ];

      const create_issues = entries
        .filter((e) => tags[e.id] === "issue")
        .map((e) => ({
          title:    issueForms[e.id]?.title    || e.content || e.caption || "Issue",
          location: issueForms[e.id]?.location || "",
          trade:    issueForms[e.id]?.trade    || "General",
        }));

      const create_schedule_items = entries
        .filter((e) => tags[e.id] === "schedule")
        .map((e) => ({
          title:    scheduleForms[e.id]?.title    || e.content || e.caption || "Task",
          due_date: scheduleForms[e.id]?.due_date || "",
          notes:    scheduleForms[e.id]?.notes    || "",
        }));

      const data = await apiFetch(`/daily-log/${log.id}/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weather,
          manpower_count:  manpowerCount ? Number(manpowerCount) : null,
          manpower_detail: manpowerDetail || null,
          narrative,
          tomorrow_checklist,
          create_issues,
          create_schedule_items,
        }),
      });

      setResult(data);
    } catch (e) {
      setError(e.message || "Compile failed");
    } finally {
      setCompiling(false);
    }
  }

  // ── Done / Results screen ──
  if (result) {
    const issues = result.created_issues || [];
    const items  = result.created_schedule_items || [];
    const checklist = result.log?.tomorrow_checklist || [];

    return (
      <Card>
        <div className="mb-4 text-center text-4xl">✅</div>
        <div className="mb-1 text-center text-xl font-extrabold text-slate-900">Day Compiled</div>
        <div className="mb-6 text-center text-sm text-slate-500">
          Your daily log is saved and locked.
        </div>

        {issues.length > 0 && (
          <div className="mb-4">
            <SectionLabel>Issues Created ({issues.length})</SectionLabel>
            <div className="space-y-1">
              {issues.map((i) => (
                <div key={i.id} className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  ⚠ {i.title}
                </div>
              ))}
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="mb-4">
            <SectionLabel>Schedule Items Created ({items.length})</SectionLabel>
            <div className="space-y-1">
              {items.map((i) => (
                <div key={i.id} className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  📅 {i.title}
                </div>
              ))}
            </div>
          </div>
        )}

        {checklist.length > 0 && (
          <div className="mb-4">
            <SectionLabel>Tomorrow's Checklist ({checklist.length})</SectionLabel>
            <div className="space-y-1">
              {checklist.map((item, i) => (
                <div key={i} className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  ✓ {item}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onDone}
          className="mt-2 w-full rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Done
        </button>
      </Card>
    );
  }

  // ── Compile form ──
  return (
    <div className="space-y-4">
      {/* Back */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-2xl border border-black/10 bg-white p-2.5 shadow-sm hover:bg-slate-50"
        >
          <svg className="h-5 w-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-xl font-extrabold text-slate-900">End of Day — Compile</div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      {/* Day Summary */}
      <Card>
        <SectionLabel>Day Summary</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputRow label="Weather / Conditions">
            <input
              value={weather}
              onChange={(e) => setWeather(e.target.value)}
              placeholder="Clear, 78°F / Rain delay…"
              className={inputCls}
            />
          </InputRow>
          <InputRow label="Total Manpower on Site">
            <input
              type="number"
              value={manpowerCount}
              onChange={(e) => setMpCount(e.target.value)}
              placeholder="12"
              className={inputCls}
            />
          </InputRow>
          <InputRow label="Trades / Breakdown">
            <input
              value={manpowerDetail}
              onChange={(e) => setMpDetail(e.target.value)}
              placeholder="Framers 5, Electricians 2, Concrete 5…"
              className={`${inputCls} sm:col-span-2`}
            />
          </InputRow>
          <div className="sm:col-span-2">
            <InputRow label="Day Narrative">
              <textarea
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                placeholder="Summary of what happened today…"
                rows={3}
                className={`${inputCls} w-full resize-none`}
              />
            </InputRow>
          </div>
        </div>
      </Card>

      {/* Tag Entries */}
      {entries.length > 0 && (
        <Card>
          <SectionLabel>Tag Entries — what should each become?</SectionLabel>
          <div className="space-y-3">
            {entries.map((entry) => {
              const tag = tags[entry.id] || null;
              const preview = entry.content || entry.caption || "Photo";

              const tagMeta = {
                issue:    { label: "⚠ Issue",         border: "border-amber-300",   bg: "bg-amber-50" },
                schedule: { label: "📅 Schedule Item", border: "border-blue-300",    bg: "bg-blue-50" },
                tomorrow: { label: "✓ Tomorrow",       border: "border-emerald-300", bg: "bg-emerald-50" },
              };
              const tagged = tag ? tagMeta[tag] : null;

              return (
                <div key={entry.id} className={`rounded-2xl border p-3 transition ${tagged ? `${tagged.border} ${tagged.bg}` : "border-black/10 bg-slate-50"}`}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">{prettyTime(entry.time)}</span>
                    {tagged && (
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                        tag === "issue"    ? "border-amber-400 bg-amber-400 text-white" :
                        tag === "schedule" ? "border-blue-400 bg-blue-400 text-white" :
                        "border-emerald-500 bg-emerald-500 text-white"
                      }`}>{tagged.label}</span>
                    )}
                  </div>
                  <p className="mb-3 text-sm text-slate-800">{preview}</p>

                  {/* Tag pills */}
                  <div className="mb-3 flex flex-wrap gap-2">
                    {[
                      { key: "issue",    label: "⚠ Issue",         active: "bg-amber-500 text-white border-amber-500" },
                      { key: "schedule", label: "📅 Schedule Item", active: "bg-blue-500 text-white border-blue-500" },
                      { key: "tomorrow", label: "✓ Tomorrow",       active: "bg-emerald-500 text-white border-emerald-500" },
                    ].map(({ key, label, active }) => (
                      <button
                        key={key}
                        onClick={() => setTag(entry.id, key)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                          tag === key ? active : "border-black/10 bg-white text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Issue detail form */}
                  {tag === "issue" && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={issueForms[entry.id]?.title || ""}
                        onChange={(e) => setIssueField(entry.id, "title", e.target.value)}
                        placeholder="Issue title"
                        className={`${inputCls} sm:col-span-3`}
                      />
                      <input
                        value={issueForms[entry.id]?.location || ""}
                        onChange={(e) => setIssueField(entry.id, "location", e.target.value)}
                        placeholder="Location"
                        className={inputCls}
                      />
                      <input
                        value={issueForms[entry.id]?.trade || ""}
                        onChange={(e) => setIssueField(entry.id, "trade", e.target.value)}
                        placeholder="Trade"
                        className={inputCls}
                      />
                    </div>
                  )}

                  {/* Schedule detail form */}
                  {tag === "schedule" && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={scheduleForms[entry.id]?.title || ""}
                        onChange={(e) => setScheduleField(entry.id, "title", e.target.value)}
                        placeholder="Task title"
                        className={`${inputCls} sm:col-span-2`}
                      />
                      <input
                        type="date"
                        value={scheduleForms[entry.id]?.due_date || ""}
                        onChange={(e) => setScheduleField(entry.id, "due_date", e.target.value)}
                        className={inputCls}
                      />
                      <input
                        value={scheduleForms[entry.id]?.notes || ""}
                        onChange={(e) => setScheduleField(entry.id, "notes", e.target.value)}
                        placeholder="Notes (optional)"
                        className={inputCls}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Tomorrow's Checklist (manual) */}
      <Card>
        <SectionLabel>Tomorrow's Checklist — add items</SectionLabel>
        <div className="space-y-2">
          {checkItems.map((item, i) => (
            <input
              key={i}
              value={item}
              onChange={(e) => setCheckItem(i, e.target.value)}
              placeholder={`Item ${i + 1}`}
              className={`${inputCls} w-full`}
            />
          ))}
          <button
            onClick={addCheckItem}
            className="w-full rounded-2xl border border-dashed border-slate-300 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-slate-500 hover:text-slate-800"
          >
            + Add Item
          </button>
        </div>
      </Card>

      {/* Finalize */}
      <Card>
        <button
          onClick={handleCompile}
          disabled={compiling}
          className="w-full rounded-2xl bg-slate-900 py-3.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {compiling ? "Compiling…" : "Finalize Day"}
        </button>
        <p className="mt-2 text-center text-xs text-slate-400">
          This will create the tagged issues &amp; schedule items and lock today's log.
        </p>
      </Card>
    </div>
  );
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function csvEscape(val) {
  const s = String(val ?? "").replace(/"/g, '""');
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
}

function exportCSV(log, projectName) {
  const entries = Array.isArray(log.entries) ? log.entries : [];
  const checklist = Array.isArray(log.tomorrow_checklist) ? log.tomorrow_checklist : [];
  const dateStr = log.log_date
    ? new Date(log.log_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const rows = [
    ["GC Suite – Daily Log"],
    ["Project", projectName],
    ["Date", dateStr],
    [],
    ["SUMMARY"],
    ["Weather", log.weather || ""],
    ["Manpower", log.manpower_count || ""],
    ["Trades / Breakdown", log.manpower_detail || ""],
    ["Narrative", log.narrative || ""],
    [],
    ["FIELD ENTRIES"],
    ["Time", "Type", "Content / Caption"],
    ...entries.map((e) => [e.time || "", e.type || "", e.content || e.caption || ""]),
  ];

  if (checklist.length > 0) {
    rows.push([]);
    rows.push(["TOMORROW'S CHECKLIST"]);
    checklist.forEach((item) => rows.push(["", item]));
  }

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `daily-log-${log.log_date || new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportPDF(log, projectName, projectLoc) {
  const entries = Array.isArray(log.entries) ? log.entries : [];
  const checklist = Array.isArray(log.tomorrow_checklist) ? log.tomorrow_checklist : [];
  const dateStr = log.log_date
    ? new Date(log.log_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Daily Log – ${esc(dateStr)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
           max-width: 780px; margin: 0 auto; padding: 40px 28px; color: #0f172a; font-size: 14px; line-height: 1.5; }
    h1 { font-size: 24px; font-weight: 800; margin-bottom: 4px; }
    .meta { color: #64748b; font-size: 13px; margin-bottom: 28px; }
    .section-label { font-size: 10px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase;
                     color: #94a3b8; margin: 22px 0 8px; border-top: 1px solid #e2e8f0; padding-top: 14px; }
    .kv { display: flex; gap: 12px; margin-bottom: 6px; }
    .kv .k { font-weight: 600; color: #475569; min-width: 120px; flex-shrink: 0; }
    .narrative { background: #f8fafc; border-radius: 10px; padding: 14px; line-height: 1.7; margin-top: 6px; }
    .entry { border-left: 3px solid #e2e8f0; padding: 6px 0 6px 14px; margin-bottom: 10px; }
    .entry-meta { font-size: 11px; color: #94a3b8; margin-bottom: 3px; }
    .entry-content { color: #1e293b; }
    .check { display: flex; gap: 8px; margin-bottom: 5px; }
    .check-icon { color: #10b981; font-weight: 700; }
    footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #e2e8f0;
             font-size: 11px; color: #94a3b8; text-align: center; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>Daily Log</h1>
  <div class="meta">${esc(projectName)}${projectLoc ? " &middot; " + esc(projectLoc) : ""} &middot; ${esc(dateStr)}</div>

  <div class="section-label">Day Summary</div>
  ${log.weather ? `<div class="kv"><span class="k">Weather</span> <span>${esc(log.weather)}</span></div>` : ""}
  ${log.manpower_count ? `<div class="kv"><span class="k">Manpower</span> <span>${esc(log.manpower_count)} on site</span></div>` : ""}
  ${log.manpower_detail ? `<div class="kv"><span class="k">Trades</span> <span>${esc(log.manpower_detail)}</span></div>` : ""}
  ${log.narrative ? `<div class="section-label">Narrative</div><div class="narrative">${esc(log.narrative)}</div>` : ""}

  ${entries.length > 0 ? `
  <div class="section-label">Field Entries (${entries.length})</div>
  ${entries.map((e) => `
    <div class="entry">
      <div class="entry-meta">${esc(prettyTime(e.time))}${e.type === "voice" ? " &middot; Voice memo" : e.type === "photo" ? " &middot; Photo" : ""}</div>
      <div class="entry-content">${esc(e.content || e.caption || "")}</div>
    </div>`).join("")}
  ` : ""}

  ${checklist.length > 0 ? `
  <div class="section-label">Tomorrow's Checklist</div>
  ${checklist.map((item) => `<div class="check"><span class="check-icon">✓</span> <span>${esc(item)}</span></div>`).join("")}
  ` : ""}

  <footer>Generated by GC Suite &middot; ${esc(dateStr)}</footer>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DailyLogPage() {
  const { projectId } = useParams();
  const apiBase = useMemo(() => getApiBase(), []);

  const searchParams = useSearchParams();

  const [view, setView]       = useState("log"); // 'log' | 'compile'
  const [addMode, setAddMode] = useState(null);  // null | 'note' | 'voice'

  const [log, setLog]                     = useState(null);
  const [projectName, setProjectName]     = useState("");
  const [projectLoc, setProjectLoc]       = useState("");
  const [loadError, setLoadError]         = useState("");
  const [saving, setSaving]               = useState(false);
  const [actionError, setActionError]     = useState("");

  // Note input — pre-fill from Smart Capture ?note= param
  const [noteText, setNoteText] = useState("");

  // Photo input ref
  const photoInputRef = useRef(null);

  // If Smart Capture sent a note, open note input mode automatically
  useEffect(() => {
    const note = searchParams.get("note");
    if (note) {
      setNoteText(decodeURIComponent(note));
      setAddMode("note");
    }
  }, [searchParams]);

  async function apiFetch(path, opts = {}) {
    const token = getToken();
    if (!token) throw new Error("Not logged in");
    const res = await fetch(`${apiBase}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
    if (!res.ok) {
      let msg = `Error ${res.status}`;
      try { const d = await res.json(); msg = d?.error || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadError("");
      // Load project name first so the header always shows correctly
      try {
        const projects = await apiFetch(`/projects`);
        if (cancelled) return;
        const p = projects.find((x) => x.id === projectId);
        if (p) { setProjectName(p.name || ""); setProjectLoc(p.location || ""); }
      } catch (e) {
        if (cancelled) return;
        // Non-fatal — header just shows "Project"
      }
      // Load today's log separately so a DB error doesn't wipe the project name
      try {
        const todayLog = await apiFetch(`/projects/${projectId}/daily-log/today`);
        if (cancelled) return;
        setLog(todayLog);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e.message || "Failed to load daily log");
      }
    }
    if (projectId) load();
    return () => { cancelled = true; };
  }, [projectId]);

  // ── Add entries ─────────────────────────────────────────────────────────────

  async function addEntry(entry) {
    if (!log) return;
    setSaving(true);
    setActionError("");
    try {
      const currentEntries = Array.isArray(log.entries) ? log.entries : [];
      const newEntry = { id: entryId(), time: nowTime(), created_at: new Date().toISOString(), ...entry };
      const updated = await apiFetch(`/daily-log/${log.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: [...currentEntries, newEntry] }),
      });
      setLog(updated);
    } catch (e) {
      setActionError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(entryId) {
    if (!log) return;
    const updated = (Array.isArray(log.entries) ? log.entries : []).filter(
      (e) => e.id !== entryId
    );
    setSaving(true);
    setActionError("");
    try {
      const updatedLog = await apiFetch(`/daily-log/${log.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: updated }),
      });
      setLog(updatedLog);
    } catch (e) {
      setActionError(e.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  function saveNote() {
    const text = noteText.trim();
    if (!text) return;
    addEntry({ type: "note", content: text });
    setNoteText("");
    setAddMode(null);
  }

  function saveVoice(transcript) {
    addEntry({ type: "voice", content: transcript });
    setAddMode(null);
  }

  async function handlePhotoFile(file) {
    if (!log || !file) return;
    setSaving(true);
    setActionError("");
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const token = getToken();
      const res = await fetch(`${apiBase}/daily-log/${log.id}/photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Upload failed");
      }
      const data = await res.json();
      setLog(data.log);
    } catch (e) {
      setActionError(e.message || "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const entries = log ? (Array.isArray(log.entries) ? log.entries : []) : [];
  const isCompiled = log?.status === "COMPILED";

  if (view === "compile" && log) {
    return (
      <div className="space-y-4">
        <ProjectHeader projectName={projectName || "Project"} location={projectLoc || ""} />
        <CompileScreen
          log={log}
          apiBase={apiBase}
          onBack={() => setView("log")}
          onDone={() => { setView("log"); setLog((prev) => prev ? { ...prev, status: "COMPILED" } : prev); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProjectHeader projectName={projectName || "Project"} location={projectLoc || ""} />

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{loadError}</div>
      )}
      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{actionError}</div>
      )}

      {/* Day header */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-extrabold text-slate-900">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </div>
            <div className="mt-0.5 text-sm text-slate-500">
              {entries.length} {entries.length === 1 ? "entry" : "entries"} today
            </div>
          </div>
          {isCompiled ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Filed ✓
              </span>
              <button
                onClick={() => exportCSV(log, projectName)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                title="Export to Excel / CSV"
              >
                CSV
              </button>
              <button
                onClick={() => exportPDF(log, projectName, projectLoc)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                title="Print / Save as PDF"
              >
                PDF
              </button>
              <button
                onClick={async () => {
                  try {
                    const reopened = await apiFetch(`/daily-log/${log.id}/reopen`, { method: "POST" });
                    setLog(reopened);
                  } catch (e) {
                    setActionError(e.message || "Failed to reopen log");
                  }
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Reopen
              </button>
              <button
                onClick={async () => {
                  setLog(null);
                  try {
                    const fresh = await apiFetch(`/projects/${projectId}/daily-log/today`);
                    setLog(fresh);
                  } catch (e) {
                    setActionError(e.message || "Failed to start new log");
                  }
                }}
                className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                + New Log
              </button>
            </div>
          ) : (
            <button
              onClick={() => setView("compile")}
              disabled={!log || entries.length === 0}
              className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              End Day →
            </button>
          )}
        </div>
      </Card>

      {/* Add entry controls */}
      {!isCompiled && log && (
        <>
          {addMode === "note" && (
            <Card>
              <SectionLabel>Quick Note</SectionLabel>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="What's happening on site right now?"
                rows={3}
                autoFocus
                className={`${inputCls} w-full resize-none`}
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => { setAddMode(null); setNoteText(""); }}
                  className="flex-1 rounded-2xl border border-black/10 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNote}
                  disabled={!noteText.trim() || saving}
                  className="flex-1 rounded-2xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save Note"}
                </button>
              </div>
            </Card>
          )}

          {addMode === "voice" && (
            <VoiceRecorder
              onSave={saveVoice}
              onCancel={() => setAddMode(null)}
            />
          )}

          {addMode === null && (
            <Card>
              <SectionLabel>Add to Today's Log</SectionLabel>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setAddMode("note")}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-black/10 bg-slate-50 py-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <span className="text-2xl">📝</span>
                  Note
                </button>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={saving}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-black/10 bg-slate-50 py-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                >
                  <span className="text-2xl">📷</span>
                  Photo
                </button>
                <button
                  onClick={() => setAddMode("voice")}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-black/10 bg-slate-50 py-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <span className="text-2xl">🎙️</span>
                  Voice
                </button>
              </div>
              {/* Hidden photo file input */}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoFile(file);
                  e.target.value = "";
                }}
              />
            </Card>
          )}
        </>
      )}

      {/* Timeline */}
      {entries.length === 0 ? (
        <Card>
          <div className="py-10 text-center text-sm text-slate-400">
            {isCompiled
              ? "This day has been compiled."
              : "Nothing logged yet — add a note, photo, or voice memo above."}
          </div>
        </Card>
      ) : (
        <Card>
          <SectionLabel>Today's Timeline</SectionLabel>
          <div>
            {entries.map((entry, i) => (
              <EntryCard
                key={entry.id || i}
                entry={entry}
                apiBase={apiBase}
                onDelete={!isCompiled ? () => deleteEntry(entry.id) : undefined}
              />
            ))}
            {/* End of timeline dot */}
            <div className="ml-4 h-3 w-3 -translate-x-1.5 rounded-full border-2 border-slate-300 bg-white" />
          </div>
        </Card>
      )}

      {/* Compiled summary */}
      {isCompiled && (
        <Card>
          <SectionLabel>Day Summary</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            {log.weather && <div><span className="font-semibold text-slate-500">Weather: </span>{log.weather}</div>}
            {log.manpower_count && <div><span className="font-semibold text-slate-500">Manpower: </span>{log.manpower_count} on site</div>}
            {log.manpower_detail && <div className="sm:col-span-2"><span className="font-semibold text-slate-500">Trades: </span>{log.manpower_detail}</div>}
            {log.narrative && <div className="sm:col-span-2 leading-relaxed text-slate-700">{log.narrative}</div>}
          </div>

          {Array.isArray(log.tomorrow_checklist) && log.tomorrow_checklist.length > 0 && (
            <div className="mt-4">
              <SectionLabel>Tomorrow's Checklist</SectionLabel>
              <div className="space-y-1">
                {log.tomorrow_checklist.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-0.5 text-emerald-500">✓</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
