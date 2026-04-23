"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import ProjectHeader from "../../../../../components/ProjectHeader";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem("token") || "";
}

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  return "http://localhost:3005";
}

function prettyDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date)) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusBadge(status) {
  if (status === "OPEN")     return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "ANSWERED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "CLOSED")   return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-slate-200 bg-slate-100 text-slate-500";
}

// ─── Empty state for new RFI ──────────────────────────────────────────────────

function emptyRfi() {
  return {
    title:    "",
    question: "",
    to_name:  "",
    due_date: "",
  };
}

// ─── Create / Edit Form ───────────────────────────────────────────────────────

function RfiForm({ initial, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(() => ({ ...emptyRfi(), ...initial }));

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-base font-bold text-slate-900">
        {initial?.id ? "Edit RFI" : "New Request for Information"}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs font-semibold text-slate-600">Subject / Title</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Clarify slab edge detail at grid C-7"
            className="rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs font-semibold text-slate-600">Question</label>
          <textarea
            value={form.question}
            onChange={(e) => set("question", e.target.value)}
            placeholder="Describe the question or clarification needed…"
            rows={4}
            className="resize-none rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-600">Addressed To</label>
          <input
            type="text"
            value={form.to_name}
            onChange={(e) => set("to_name", e.target.value)}
            placeholder="Architect / Engineer name or firm"
            className="rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-600">Response Due</label>
          <input
            type="date"
            value={form.due_date}
            onChange={(e) => set("due_date", e.target.value)}
            className="rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.title || !form.question}
          className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 hover:bg-slate-800"
        >
          {saving ? "Saving…" : "Submit RFI"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── RFI Attachments ──────────────────────────────────────────────────────────

function RfiAttachments({ rfiId, apiBase }) {
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading]     = useState(false);
  const fileRef                       = useRef(null);

  function loadAttachments() {
    const token = getToken();
    fetch(`${apiBase}/rfi/${rfiId}/attachments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setAttachments(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }

  useEffect(() => { if (rfiId) loadAttachments(); }, [rfiId]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const token = getToken();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${apiBase}/rfi/${rfiId}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) { loadAttachments(); }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(id) {
    const token = getToken();
    await fetch(`${apiBase}/rfi-attachment/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  const isImage = (url) => /\.(jpg|jpeg|png|gif|webp)$/i.test(url);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        Attachments
      </div>

      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-3">
          {attachments.map((a) => (
            <div key={a.id} className="group relative">
              {isImage(a.file_url) ? (
                <a href={`${apiBase}${a.file_url}`} target="_blank" rel="noreferrer">
                  <img
                    src={`${apiBase}${a.file_url}`}
                    alt={a.original_name}
                    className="h-20 w-20 rounded-xl object-cover ring-1 ring-slate-200 hover:ring-slate-400"
                  />
                </a>
              ) : (
                <a
                  href={`${apiBase}${a.file_url}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-20 w-20 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-center text-[10px] text-slate-600 hover:bg-slate-100"
                >
                  <span className="text-2xl">📎</span>
                  <span className="mt-1 truncate px-1">{a.original_name}</span>
                </a>
              )}
              <button
                onClick={() => handleDelete(a.id)}
                className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xlsx" className="hidden"
        onChange={handleUpload} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-500 hover:border-slate-500 hover:text-slate-900 disabled:opacity-40"
      >
        {uploading ? "Uploading…" : "+ Attach File or Photo"}
      </button>
    </div>
  );
}

// ─── RFI Detail View ──────────────────────────────────────────────────────────

function RfiDetail({ rfi, me, onRespond, onClose, onBack, saving, error, apiBase }) {
  const [response, setResponse] = useState(rfi.response || "");
  const isGC = String(me?.role || "").toUpperCase().startsWith("GC");

  const canRespond = isGC && rfi.status === "OPEN";
  const canClose   = isGC && rfi.status === "ANSWERED";

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        ← All RFIs
      </button>

      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">
                RFI-{String(rfi.rfi_number).padStart(3, "0")}
              </span>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadge(rfi.status)}`}
              >
                {{OPEN:"Open",ANSWERED:"Answered",CLOSED:"Closed"}[rfi.status]??rfi.status}
              </span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{rfi.title}</h2>
          </div>
        </div>

        <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          {rfi.to_name && (
            <div><span className="font-semibold text-slate-800">To:</span> {rfi.to_name}</div>
          )}
          {rfi.due_date && (
            <div><span className="font-semibold text-slate-800">Due:</span> {prettyDate(rfi.due_date)}</div>
          )}
          <div><span className="font-semibold text-slate-800">Created:</span> {prettyDate(rfi.created_at)}</div>
          {rfi.created_by_name && (
            <div><span className="font-semibold text-slate-800">By:</span> {rfi.created_by_name}</div>
          )}
        </div>
      </div>

      {/* Question */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Question
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{rfi.question}</p>
      </div>

      {/* Response */}
      {rfi.status !== "OPEN" && rfi.response && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600">
            Response
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-emerald-900">{rfi.response}</p>
          {rfi.responded_at && (
            <div className="mt-2 text-xs text-emerald-600">{prettyDate(rfi.responded_at)}</div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Attachments */}
      <RfiAttachments rfiId={rfi.id} apiBase={apiBase} />

      {/* Respond form (GC, open RFI) */}
      {canRespond && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Your Response
          </div>
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Type your response here…"
            rows={4}
            className="w-full resize-none rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
          <div className="mt-3">
            <button
              onClick={() => onRespond(response)}
              disabled={saving || !response.trim()}
              className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 hover:bg-emerald-700"
            >
              {saving ? "Sending…" : "Send Response"}
            </button>
          </div>
        </div>
      )}

      {/* Close button (GC, answered RFI) */}
      {canClose && (
        <button
          onClick={onClose}
          disabled={saving}
          className="rounded-2xl bg-slate-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 hover:bg-slate-800"
        >
          {saving ? "Closing…" : "Close RFI"}
        </button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RfisPage() {
  const { projectId } = useParams();
  const apiBase = useMemo(() => getApiBase(), []);

  const [view, setView]               = useState("list"); // "list" | "new" | "detail"
  const [rfis, setRfis]               = useState([]);
  const [activeRfi, setActiveRfi]     = useState(null);
  const [me, setMe]                   = useState(null);
  const [projectName, setProjectName] = useState("");
  const [projectLoc, setProjectLoc]   = useState("");
  const [loadError, setLoadError]     = useState("");
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState("");
  const [filter, setFilter]           = useState("ALL"); // ALL | OPEN | ANSWERED | CLOSED

  async function apiFetch(path, opts = {}) {
    const token = getToken();
    if (!token) throw new Error("Not logged in");
    const res = await fetch(`${apiBase}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try { const d = await res.json(); msg = d?.error || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  }

  async function loadRfis() {
    const rows = await apiFetch(`/projects/${projectId}/rfis`);
    setRfis(Array.isArray(rows) ? rows : []);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadError("");
      try {
        const projects = await apiFetch("/projects");
        const p = projects.find((x) => x.id === projectId);
        if (p && !cancelled) { setProjectName(p.name || ""); setProjectLoc(p.location || ""); }

        const meRes = await apiFetch(`/projects/${projectId}/me`);
        if (!cancelled) setMe(meRes);

        const rows = await apiFetch(`/projects/${projectId}/rfis`);
        if (!cancelled) setRfis(Array.isArray(rows) ? rows : []);
      } catch (e) {
        if (!cancelled) setLoadError(e?.message || "Failed to load");
      }
    }
    if (projectId) load();
    return () => { cancelled = true; };
  }, [projectId]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return rfis;
    return rfis.filter((r) => r.status === filter);
  }, [rfis, filter]);

  const stats = useMemo(() => ({
    open:     rfis.filter((r) => r.status === "OPEN").length,
    answered: rfis.filter((r) => r.status === "ANSWERED").length,
    closed:   rfis.filter((r) => r.status === "CLOSED").length,
  }), [rfis]);

  async function handleCreate(formData) {
    setSaving(true);
    setFormError("");
    try {
      await apiFetch(`/projects/${projectId}/rfis`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(formData),
      });
      await loadRfis();
      setView("list");
    } catch (e) {
      setFormError(e?.message || "Failed to create RFI");
    } finally {
      setSaving(false);
    }
  }

  async function handleRespond(responseText) {
    setSaving(true);
    setFormError("");
    try {
      const updated = await apiFetch(`/rfi/${activeRfi.id}/respond`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ response: responseText }),
      });
      setActiveRfi(updated);
      await loadRfis();
    } catch (e) {
      setFormError(e?.message || "Failed to respond");
    } finally {
      setSaving(false);
    }
  }

  async function handleClose() {
    setSaving(true);
    setFormError("");
    try {
      const updated = await apiFetch(`/rfi/${activeRfi.id}/close`, { method: "POST" });
      setActiveRfi(updated);
      await loadRfis();
    } catch (e) {
      setFormError(e?.message || "Failed to close RFI");
    } finally {
      setSaving(false);
    }
  }

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (view === "detail" && activeRfi) {
    return (
      <div className="space-y-4">
        <ProjectHeader projectName={projectName} location={projectLoc} />
        <RfiDetail
          rfi={activeRfi}
          me={me}
          saving={saving}
          error={formError}
          onRespond={handleRespond}
          onClose={handleClose}
          onBack={() => { setView("list"); setActiveRfi(null); setFormError(""); }}
          apiBase={apiBase}
        />
      </div>
    );
  }

  // ── New RFI form ─────────────────────────────────────────────────────────────
  if (view === "new") {
    return (
      <div className="space-y-4">
        <ProjectHeader projectName={projectName} location={projectLoc} />
        <RfiForm
          initial={emptyRfi()}
          onSave={handleCreate}
          onCancel={() => { setView("list"); setFormError(""); }}
          saving={saving}
          error={formError}
        />
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <ProjectHeader projectName={projectName} location={projectLoc} />

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {loadError}
        </div>
      )}

      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">Requests for Information</h2>
        <button
          onClick={() => { setView("new"); setFormError(""); }}
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          + New RFI
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {[
          { label: "All",      key: "ALL",      count: rfis.length },
          { label: "Open",     key: "OPEN",     count: stats.open },
          { label: "Answered", key: "ANSWERED", count: stats.answered },
          { label: "Closed",   key: "CLOSED",   count: stats.closed },
        ].map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilter(chip.key)}
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filter === chip.key
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {chip.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                filter === chip.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {chip.count}
            </span>
          </button>
        ))}
      </div>

      {/* RFI list */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            {rfis.length === 0
              ? "No RFIs yet — create the first one."
              : "No RFIs match this filter."}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((rfi) => (
              <button
                key={rfi.id}
                onClick={() => { setActiveRfi(rfi); setView("detail"); setFormError(""); }}
                className="w-full px-5 py-4 text-left transition hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-400">
                        RFI-{String(rfi.rfi_number).padStart(3, "0")}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadge(rfi.status)}`}
                      >
                        {{OPEN:"Open",ANSWERED:"Answered",CLOSED:"Closed"}[rfi.status]??rfi.status}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                      {rfi.title}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {rfi.to_name ? `To: ${rfi.to_name} · ` : ""}
                      {prettyDate(rfi.created_at)}
                      {rfi.created_by_name ? ` · ${rfi.created_by_name}` : ""}
                    </div>
                  </div>
                  {rfi.due_date && rfi.status === "OPEN" && (
                    <div className="flex-shrink-0 text-right">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Due
                      </div>
                      <div className="text-xs font-semibold text-slate-700">
                        {prettyDate(rfi.due_date)}
                      </div>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
