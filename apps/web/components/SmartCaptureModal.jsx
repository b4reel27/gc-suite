"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const TYPE_META = {
  issue:     { label: "Field Issue",    icon: "⚠️",  short: "Issue" },
  schedule:  { label: "Schedule Item",  icon: "📅",  short: "Sched" },
  daily_log: { label: "Daily Log",      icon: "📝",  short: "Log"   },
};

export default function SmartCaptureModal({ projectId, onClose }) {
  const router = useRouter();
  const recRef = useRef(null);

  const [text,      setText]      = useState("");
  const [listening, setListening] = useState(false);
  const [parsing,   setParsing]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  // ── Voice ──────────────────────────────────────────────────────────────────
  function toggleVoice() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError("Voice not supported in this browser."); return; }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    let resultHandled = false;
    rec.onresult = (e) => {
      if (resultHandled) return;
      resultHandled = true;
      const t = Array.from(e.results).map((r) => r[0].transcript).join(" ").trim();
      if (t) setText((prev) => (prev ? prev + " " + t : t));
    };
    rec.onend   = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }

  // ── AI Parse ───────────────────────────────────────────────────────────────
  async function handleParse() {
    if (!text.trim()) return;
    setParsing(true);
    setError("");
    setResult(null);
    try {
      const r = await apiFetch(`${API_BASE}/ai/parse`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || (r.status === 429 ? "AI is busy — wait a moment and try again" : "Parse failed"));
      }
      const data = await r.json();
      if (!data.title) throw new Error("AI returned no result — try rephrasing.");
      setResult(data);
    } catch (e) {
      setError(e.message || "Parse failed");
    } finally {
      setParsing(false);
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!result) return;
    setSaving(true);
    setError("");
    try {
      if (result.type === "issue") {
        const r = await apiFetch(`${API_BASE}/projects/${projectId}/punch`, {
          method: "POST",
          body: JSON.stringify({
            title:    result.title,
            trade:    result.trade    || null,
            location: result.location || null,
          }),
        });
        if (!r.ok) throw new Error("Failed to save issue");
        onClose();
        router.push(`/projects/${projectId}/punch`);
      } else if (result.type === "schedule") {
        const date = result.start_date || result.due_date || new Date().toISOString().slice(0, 10);
        const r = await apiFetch(`${API_BASE}/projects/${projectId}/schedule`, {
          method: "POST",
          body: JSON.stringify({
            title:      result.title,
            start_date: date,
            end_date:   result.due_date || date,
            trade:      result.trade || null,
          }),
        });
        if (!r.ok) throw new Error("Failed to save schedule item");
        onClose();
        router.push(`/projects/${projectId}/schedule`);
      } else {
        // daily_log — navigate with note pre-filled
        const note = result.description || result.title || text;
        onClose();
        router.push(`/projects/${projectId}/daily-log?note=${encodeURIComponent(note)}`);
      }
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function update(key, val) {
    setResult((r) => ({ ...r, [key]: val }));
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/60 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 pb-8 shadow-2xl sm:rounded-3xl sm:pb-5">

        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-lg font-extrabold text-slate-900">✨ Smart Capture</div>
            <div className="text-sm text-slate-500">Describe it — AI will sort the rest</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
          >
            ✕
          </button>
        </div>

        {/* Text input */}
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setResult(null); setError(""); }}
          rows={3}
          placeholder={"\"Paint touch up north wall room 103\"\n\"Concrete pour Friday at 7am\"\n\"Plumbers had 4 guys, finished rough-in\""}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
          autoFocus
        />

        {/* Actions row */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={toggleVoice}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
              listening
                ? "border-red-300 bg-red-50 text-red-600"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            🎤 {listening ? "Stop" : "Speak"}
          </button>
          <button
            type="button"
            onClick={handleParse}
            disabled={!text.trim() || parsing}
            className={`flex-1 rounded-xl py-2 text-sm font-bold transition ${
              !text.trim() || parsing
                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                : "bg-slate-900 text-white hover:bg-slate-800 active:scale-95"
            }`}
          >
            {parsing ? "Parsing…" : "✨ Parse with AI"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Result preview */}
        {result && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">

            {/* Type row + switcher */}
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xl leading-none">{TYPE_META[result.type]?.icon ?? "📌"}</span>
              <span className="font-bold text-emerald-900">
                {TYPE_META[result.type]?.label ?? result.type}
              </span>
              <div className="ml-auto flex gap-1">
                {Object.entries(TYPE_META).map(([key, m]) => (
                  <button
                    key={key}
                    onClick={() => update("type", key)}
                    className={`rounded-lg px-2 py-0.5 text-xs font-bold transition ${
                      result.type === key
                        ? "bg-emerald-700 text-white"
                        : "bg-white text-emerald-700 hover:bg-emerald-100"
                    }`}
                  >
                    {m.short}
                  </button>
                ))}
              </div>
            </div>

            {/* Editable fields */}
            <div className="space-y-2">
              <input
                value={result.title || ""}
                onChange={(e) => update("title", e.target.value)}
                placeholder="Title"
                className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-400"
              />

              {result.type !== "daily_log" && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={result.trade || ""}
                    onChange={(e) => update("trade", e.target.value)}
                    placeholder="Trade"
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-400"
                  />
                  <input
                    value={result.location || ""}
                    onChange={(e) => update("location", e.target.value)}
                    placeholder="Location"
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              )}

              {(result.due_date || result.start_date) && (
                <div className="flex items-center gap-2 text-xs text-emerald-700">
                  <span className="font-semibold">
                    {result.type === "schedule" ? "Start:" : "Due:"}
                  </span>
                  <input
                    type="date"
                    value={(result.type === "schedule" ? result.start_date : result.due_date) || ""}
                    onChange={(e) =>
                      update(result.type === "schedule" ? "start_date" : "due_date", e.target.value)
                    }
                    className="rounded-lg border border-emerald-200 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !result.title}
              className="mt-3 w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : `Save as ${TYPE_META[result.type]?.label ?? "Item"} →`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
