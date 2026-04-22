"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ProjectHeader from "../../../../../components/ProjectHeader";

function getToken() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem("token") || "";
}

function getApiBase() {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
}

function prettyDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date)) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_STYLES = {
  "Required":     "border-slate-200 bg-slate-100 text-slate-600",
  "Submitted":    "border-blue-200 bg-blue-50 text-blue-700",
  "Under Review": "border-amber-200 bg-amber-50 text-amber-700",
  "Approved":     "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Rejected":     "border-red-200 bg-red-50 text-red-700",
};

const TYPES      = ["Shop Drawing", "Sample", "Product Data", "O&M Manual", "Other"];
const STATUSES   = ["Required", "Submitted", "Under Review", "Approved", "Rejected"];
const ALL_FILTER = ["All", ...STATUSES];

const API_BASE = typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_API_URL || "") : "";

function SubmittalAttachments({ submittalId, apiFetch }) {
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading]     = useState(false);

  useEffect(() => {
    apiFetch(`/submittal/${submittalId}/attachments`)
      .then((d) => setAttachments(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [submittalId]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : "";
      const res = await fetch(`${API_BASE}/submittal/${submittalId}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        const att = await res.json();
        setAttachments((p) => [...p, att]);
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(id) {
    try {
      await apiFetch(`/submittal-attachment/${id}`, { method: "DELETE" });
      setAttachments((p) => p.filter((a) => a.id !== id));
    } catch {}
  }

  const isImage = (att) => (att.mime_type || "").startsWith("image/");

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500">Attachments ({attachments.length})</span>
        <label className={`cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 ${uploading ? "opacity-50" : ""}`}>
          {uploading ? "Uploading…" : "+ Attach"}
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((att) => (
            <div key={att.id} className="group relative">
              {isImage(att) ? (
                <a href={`${API_BASE}/${att.file_path}`} target="_blank" rel="noreferrer">
                  <img src={`${API_BASE}/${att.file_path}`} alt={att.original_name}
                    className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                </a>
              ) : (
                <a href={`${API_BASE}/${att.file_path}`} target="_blank" rel="noreferrer"
                  className="flex h-16 w-28 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-center text-[10px] font-medium text-slate-600 hover:bg-slate-100">
                  {att.original_name || "file"}
                </a>
              )}
              <button onClick={() => handleDelete(att.id)}
                className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function empty() {
  return {
    spec_section: "",
    title: "",
    submittal_type: "Shop Drawing",
    submitted_by: "",
    submitted_date: "",
    status: "Required",
    notes: "",
  };
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function inputCls() {
  return "rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
}

function SubmittalForm({ initial, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(() => ({ ...empty(), ...initial }));
  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-base font-bold text-slate-900">
        {initial?.id ? "Edit Submittal" : "New Submittal"}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Spec Section">
          <input type="text" value={form.spec_section} onChange={(e) => set("spec_section", e.target.value)}
            placeholder="e.g. 03 30 00" className={inputCls()} />
        </Field>

        <Field label="Type">
          <select value={form.submittal_type} onChange={(e) => set("submittal_type", e.target.value)} className={inputCls()}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>

        <Field label="Title / Description" >
          <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)}
            placeholder="Describe the item" className={`${inputCls()} sm:col-span-2`} />
        </Field>

        <Field label="Submitted By">
          <input type="text" value={form.submitted_by} onChange={(e) => set("submitted_by", e.target.value)}
            placeholder="Sub / Supplier name" className={inputCls()} />
        </Field>

        <Field label="Submitted Date">
          <input type="date" value={form.submitted_date} onChange={(e) => set("submitted_date", e.target.value)}
            className={inputCls()} />
        </Field>

        <Field label="Status">
          <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputCls()}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>

        <Field label="Notes">
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
            rows={2}
            placeholder="Any comments…"
            className="resize-none rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
        </Field>
      </div>

      <div className="flex gap-3">
        <button onClick={() => onSave(form)} disabled={saving || !form.title}
          className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel}
          className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function SubmittalsPage() {
  const { projectId } = useParams();
  const apiBase = useMemo(() => getApiBase(), []);

  const [submittals, setSubmittals]   = useState([]);
  const [projectName, setProjectName] = useState("");
  const [projectLoc, setProjectLoc]   = useState("");
  const [loadError, setLoadError]     = useState("");
  const [view, setView]               = useState("list"); // "list" | "form"
  const [editing, setEditing]         = useState(null);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState("");
  const [filter, setFilter]           = useState("All");
  const [query, setQuery]             = useState("");
  const [expanded, setExpanded]       = useState(null);

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

  async function load() {
    const rows = await apiFetch(`/projects/${projectId}/submittals`);
    setSubmittals(Array.isArray(rows) ? rows : []);
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoadError("");
      try {
        const projects = await apiFetch("/projects");
        const p = projects.find((x) => x.id === projectId);
        if (p && !cancelled) { setProjectName(p.name || ""); setProjectLoc(p.location || ""); }
        const rows = await apiFetch(`/projects/${projectId}/submittals`);
        if (!cancelled) setSubmittals(Array.isArray(rows) ? rows : []);
      } catch (e) {
        if (!cancelled) setLoadError(e?.message || "Failed to load");
      }
    }
    if (projectId) init();
    return () => { cancelled = true; };
  }, [projectId]);

  const stats = useMemo(() => {
    const counts = {};
    STATUSES.forEach((s) => { counts[s] = submittals.filter((x) => x.status === s).length; });
    return counts;
  }, [submittals]);

  const filtered = useMemo(() => {
    let list = filter === "All" ? submittals : submittals.filter((s) => s.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((s) =>
        (s.title || "").toLowerCase().includes(q) ||
        (s.spec_section || "").toLowerCase().includes(q) ||
        (s.submitted_by || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [submittals, filter, query]);

  async function handleSave(formData) {
    setSaving(true);
    setFormError("");
    try {
      if (editing?.id) {
        await apiFetch(`/submittal/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
      } else {
        await apiFetch(`/projects/${projectId}/submittals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
      }
      await load();
      setView("list");
      setEditing(null);
    } catch (e) {
      setFormError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id, status) {
    try {
      await apiFetch(`/submittal/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setSubmittals((prev) => prev.map((s) => s.id === id ? { ...s, status } : s));
    } catch {}
  }

  async function handleDelete(id) {
    if (!confirm("Delete this submittal?")) return;
    try {
      await apiFetch(`/submittal/${id}`, { method: "DELETE" });
      setSubmittals((prev) => prev.filter((s) => s.id !== id));
    } catch {}
  }

  if (view === "form") {
    return (
      <div className="space-y-4">
        <ProjectHeader projectName={projectName} location={projectLoc} />
        <SubmittalForm
          initial={editing || empty()}
          onSave={handleSave}
          onCancel={() => { setView("list"); setEditing(null); setFormError(""); }}
          saving={saving}
          error={formError}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProjectHeader projectName={projectName} location={projectLoc} />

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{loadError}</div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">Submittal Log</h2>
        <button onClick={() => { setEditing(null); setFormError(""); setView("form"); }}
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          + New Submittal
        </button>
      </div>

      {/* Status chips */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {ALL_FILTER.map((s) => (
          <button key={s} type="button" onClick={() => setFilter(s)}
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filter === s
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}>
            {s}
            {s !== "All" && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                filter === s ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
              }`}>
                {stats[s] ?? 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <input value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Search title, spec section, or sub…"
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600" />

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="py-14 text-center text-sm text-slate-400">
            {submittals.length === 0 ? "No submittals yet." : "No submittals match this filter."}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((s) => (
              <div key={s.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setExpanded((p) => p === s.id ? null : s.id)}>
                    <div className="flex flex-wrap items-center gap-2">
                      {s.spec_section && (
                        <span className="font-mono text-[11px] text-slate-400">{s.spec_section}</span>
                      )}
                      <span className="text-[11px] font-semibold text-slate-500">{s.submittal_type}</span>
                    </div>
                    <div className="mt-0.5 font-semibold text-slate-900">{s.title}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {s.submitted_by ? `${s.submitted_by} · ` : ""}
                      {prettyDate(s.submitted_date)}
                    </div>
                    {s.notes && <div className="mt-1 text-xs text-slate-500">{s.notes}</div>}
                  </button>
                  <div className="flex flex-shrink-0 flex-col items-end gap-2">
                    <select value={s.status}
                      onChange={(e) => handleStatusChange(s.id, e.target.value)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[s.status] || ""}`}>
                      {STATUSES.map((st) => <option key={st}>{st}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditing(s); setFormError(""); setView("form"); }}
                        className="text-xs text-slate-500 hover:text-slate-900">Edit</button>
                      <button onClick={() => handleDelete(s.id)}
                        className="text-xs text-red-400 hover:text-red-700">Delete</button>
                    </div>
                  </div>
                </div>
                {expanded === s.id && (
                  <SubmittalAttachments submittalId={s.id} apiFetch={apiFetch} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
