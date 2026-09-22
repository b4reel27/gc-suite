"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import ProjectHeader from "../../../../../components/ProjectHeader";

const TRADES = [
  "General",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Drywall",
  "Concrete",
  "Flooring",
  "Paint",
  "Ceiling",
  "Doors/Hardware",
  "Glazing",
  "Millwork",
  "Roofing",
  "Site",
  "Framing",
  "Steel",
  "Masonry",
];

const TYPE_LABELS = {
  QUALITY: "Quality",
  SAFETY: "Safety",
  GENERAL: "General",
};

const TYPE_BADGE = {
  QUALITY: "border-blue-200 bg-blue-50 text-blue-700",
  SAFETY: "border-red-200 bg-red-50 text-red-700",
  GENERAL: "border-slate-200 bg-slate-100 text-slate-700",
};

const PRIORITY_BADGE = {
  High: "border-red-200 bg-red-50 text-red-700",
  Medium: "border-amber-200 bg-amber-50 text-amber-700",
  Low: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const fieldClass =
  "mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

const labelClass = "text-xs font-semibold uppercase tracking-wide text-slate-500";

const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50";

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl bg-[#0b1220] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#162033]";

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

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined" && window?.location?.hostname) {
    return `http://${window.location.hostname}:3005`;
  }
  return "http://localhost:3005";
}

function StatCard({ title, value, accent }) {
  return (
    <div className="rounded-[24px] border border-black/10 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </div>
      <div className={`mt-2 text-3xl font-extrabold tracking-tight ${accent || "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-[28px] border border-black/10 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {children}
    </div>
  );
}

export default function ObservationsPage() {
  const { projectId } = useParams();
  const apiBase = useMemo(() => getApiBase(), []);

  const [observations, setObservations] = useState([]);
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Filters
  const [typeFilter, setTypeFilter] = useState("ALL"); // ALL | QUALITY | SAFETY | GENERAL
  const [statusFilter, setStatusFilter] = useState("OPEN"); // OPEN | CLOSED

  // Expanded card
  const [expandedId, setExpandedId] = useState(null);

  // New form
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState("QUALITY");
  const [formTitle, setFormTitle] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formTrade, setFormTrade] = useState("");
  const [formPriority, setFormPriority] = useState("Medium");
  const [formDesc, setFormDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Per-card busy state
  const [busyId, setBusyId] = useState(null);

  async function apiFetch(path, opts = {}) {
    const token = getToken();
    if (!token) throw new Error("Not logged in");

    const res = await fetch(`${apiBase}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });

    if (res.status === 401) {
      if (typeof window !== "undefined") window.location.href = "/login";
      throw new Error("Session expired");
    }

    const ct = res.headers.get("content-type") || "";

    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        if (ct.includes("application/json")) {
          const data = await res.json();
          msg = data?.error || JSON.stringify(data);
        } else {
          const txt = await res.text();
          if (txt) msg = txt;
        }
      } catch {
        // ignore
      }
      throw new Error(msg);
    }

    if (ct.includes("application/json")) return res.json();
    return null;
  }

  async function fetchObservations() {
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (typeFilter !== "ALL") params.set("type", typeFilter);
    const qs = params.toString();
    const res = await apiFetch(
      `/projects/${projectId}/observations${qs ? `?${qs}` : ""}`
    );
    setObservations(Array.isArray(res) ? res : res?.items || []);
  }

  async function loadProjectMeta() {
    try {
      const projects = await apiFetch("/projects");
      const p = Array.isArray(projects)
        ? projects.find((x) => x.id === projectId)
        : null;
      if (p) {
        setProjectName(p.name || "");
        setProjectLocation(p.location || "");
      }
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        await loadProjectMeta();
        const params = new URLSearchParams();
        // fetch all statuses for summary counts — we filter client-side
        const res = await apiFetch(`/projects/${projectId}/observations`);
        if (!cancelled) {
          setObservations(Array.isArray(res) ? res : res?.items || []);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Error loading observations");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [projectId]);

  // Re-fetch when filters change (server-side filtering preferred)
  useEffect(() => {
    if (!projectId || loading) return;
    let cancelled = false;
    async function reload() {
      setError("");
      try {
        await fetchObservations();
      } catch (e) {
        if (!cancelled) setError(e?.message || "Error loading observations");
      }
    }
    // Only re-fetch after initial load is done
    reload();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, statusFilter]);

  // Summary counts (from all fetched data)
  const summary = useMemo(() => {
    const open = observations.filter(
      (o) => String(o.status || "").toUpperCase() === "OPEN"
    );
    return {
      quality: open.filter((o) => String(o.obs_type || o.type || "").toUpperCase() === "QUALITY").length,
      safety: open.filter((o) => String(o.obs_type || o.type || "").toUpperCase() === "SAFETY").length,
      general: open.filter((o) => String(o.obs_type || o.type || "").toUpperCase() === "GENERAL").length,
    };
  }, [observations]);

  function resetForm() {
    setFormType("QUALITY");
    setFormTitle("");
    setFormLocation("");
    setFormTrade("");
    setFormPriority("Medium");
    setFormDesc("");
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!formTitle.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        obs_type: formType,
        title: formTitle.trim(),
        location: formLocation.trim() || null,
        trade: formTrade || null,
        priority: formPriority,
        description: formDesc.trim() || null,
      };
      await apiFetch(`/projects/${projectId}/observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      resetForm();
      setShowForm(false);
      // Refresh
      const res = await apiFetch(`/projects/${projectId}/observations`);
      setObservations(Array.isArray(res) ? res : res?.items || []);
    } catch (e) {
      setError(e?.message || "Error creating observation");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(obs) {
    setBusyId(obs.id);
    setError("");
    const currentStatus = String(obs.status || "").toUpperCase();
    const newStatus = currentStatus === "OPEN" ? "CLOSED" : "OPEN";
    try {
      await apiFetch(`/observation/${obs.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const res = await apiFetch(`/projects/${projectId}/observations`);
      setObservations(Array.isArray(res) ? res : res?.items || []);
    } catch (e) {
      setError(e?.message || "Error updating observation");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this observation? This cannot be undone.")) return;
    setBusyId(id);
    setError("");
    try {
      await apiFetch(`/observation/${id}`, { method: "DELETE" });
      setObservations((prev) => prev.filter((o) => o.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (e) {
      setError(e?.message || "Error deleting observation");
    } finally {
      setBusyId(null);
    }
  }

  // Client-side filter on top of whatever the server returned
  const filtered = useMemo(() => {
    return observations.filter((o) => {
      const type = String(o.obs_type || o.type || "").toUpperCase();
      const status = String(o.status || "").toUpperCase();
      const typeOk = typeFilter === "ALL" || type === typeFilter;
      const statusOk = statusFilter === "ALL" || status === statusFilter;
      return typeOk && statusOk;
    });
  }, [observations, typeFilter, statusFilter]);

  const typeTabs = [
    { label: "All", value: "ALL" },
    { label: "Quality", value: "QUALITY" },
    { label: "Safety", value: "SAFETY" },
    { label: "General", value: "GENERAL" },
  ];

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <ProjectHeader
        projectName={projectName || "Project"}
        location={projectLocation || ""}
      />

      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            Observations
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Field quality, safety, and general observations
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v);
            if (showForm) resetForm();
          }}
          className={`${primaryButtonClass} w-full sm:w-auto`}
        >
          {showForm ? "Cancel" : "+ New Observation"}
        </button>
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard title="Open Quality" value={summary.quality} accent="text-blue-700" />
        <StatCard title="Open Safety" value={summary.safety} accent="text-red-700" />
        <StatCard title="Open General" value={summary.general} accent="text-slate-900" />
      </div>

      {/* New Observation form */}
      {showForm ? (
        <form onSubmit={handleCreate}>
          <Card>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">New Observation</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={labelClass}>Type</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className={fieldClass}
                >
                  <option value="QUALITY">Quality</option>
                  <option value="SAFETY">Safety</option>
                  <option value="GENERAL">General</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Priority</label>
                <select
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value)}
                  className={fieldClass}
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Title *</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Brief description of the observation"
                  required
                  className={fieldClass}
                />
              </div>

              <div>
                <label className={labelClass}>Location</label>
                <input
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="e.g. Room 103, North wall"
                  className={fieldClass}
                />
              </div>

              <div>
                <label className={labelClass}>Trade</label>
                <select
                  value={formTrade}
                  onChange={(e) => setFormTrade(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">— Select trade —</option>
                  {TRADES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Description</label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={3}
                  placeholder="Additional details about the observation..."
                  className={fieldClass}
                />
              </div>

              <div className="md:col-span-2 flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className={`${primaryButtonClass} ${submitting ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  {submitting ? "Saving..." : "Save Observation"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); resetForm(); }}
                  className={secondaryButtonClass}
                >
                  Cancel
                </button>
              </div>
            </div>
          </Card>
        </form>
      ) : null}

      {/* Filter bar */}
      <Card className="!p-3 sm:!p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Type tabs */}
          <div className="flex flex-wrap gap-2">
            {typeTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setTypeFilter(tab.value)}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                  typeFilter === tab.value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status toggle */}
          <div className="flex gap-2">
            {["OPEN", "CLOSED"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                  statusFilter === s
                    ? s === "OPEN"
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-slate-400 bg-slate-100 text-slate-700"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {s === "OPEN" ? "Open" : "Closed"}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Observation list */}
      {loading ? (
        <Card className="text-sm text-slate-500">Loading observations...</Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((obs) => {
            const type = String(obs.obs_type || obs.type || "GENERAL").toUpperCase();
            const status = String(obs.status || "OPEN").toUpperCase();
            const priority = obs.priority || "Medium";
            const isOpen = status === "OPEN";
            const isExpanded = expandedId === obs.id;
            const isBusy = busyId === obs.id;

            const createdAt = obs.created_at
              ? new Date(obs.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "";

            return (
              <Card key={obs.id} className="cursor-pointer transition-shadow hover:shadow-md">
                {/* Card header — click to expand */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : obs.id)}
                  className="w-full text-left"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      {/* Badges */}
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            TYPE_BADGE[type] || TYPE_BADGE.GENERAL
                          }`}
                        >
                          {TYPE_LABELS[type] || type}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            PRIORITY_BADGE[priority] || PRIORITY_BADGE.Medium
                          }`}
                        >
                          {priority}
                        </span>
                        {!isOpen && (
                          <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                            Closed
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-slate-900">{obs.title}</h3>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                        {obs.location ? (
                          <span>
                            Location:{" "}
                            <span className="font-semibold text-slate-900">{obs.location}</span>
                          </span>
                        ) : null}
                        {(obs.trade) ? (
                          <span>
                            Trade:{" "}
                            <span className="font-semibold text-slate-900">{obs.trade}</span>
                          </span>
                        ) : null}
                        {createdAt ? (
                          <span className="text-slate-400">{createdAt}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 sm:ml-4">
                      <span className="text-xs text-slate-400">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded ? (
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    {obs.description ? (
                      <p className="mb-4 text-sm text-slate-700 whitespace-pre-wrap">
                        {obs.description}
                      </p>
                    ) : (
                      <p className="mb-4 text-sm italic text-slate-400">No description provided.</p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleToggleStatus(obs)}
                        className={`${isOpen ? primaryButtonClass : secondaryButtonClass} ${
                          isBusy ? "cursor-not-allowed opacity-50" : ""
                        }`}
                      >
                        {isBusy
                          ? "Saving..."
                          : isOpen
                          ? "Close Observation"
                          : "Reopen"}
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDelete(obs.id)}
                        className={`inline-flex items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 ${
                          isBusy ? "cursor-not-allowed opacity-50" : ""
                        }`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}

          {!filtered.length ? (
            <Card className="text-sm text-slate-500">
              No observations match the current filters.
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
