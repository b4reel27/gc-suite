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

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined" && window?.location?.hostname) {
    return `http://${window.location.hostname}:3005`;
  }
  return "http://localhost:3005";
}

function fmtDollars(value) {
  const n = Number(value) || 0;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PCO_REASONS = [
  { value: "OWNER_REQUEST", label: "Owner Request" },
  { value: "UNFORESEEN", label: "Unforeseen Conditions" },
  { value: "DESIGN_ERROR", label: "Design Error" },
  { value: "SCOPE_GAP", label: "Scope Gap" },
  { value: "WEATHER", label: "Weather" },
  { value: "OTHER", label: "Other" },
];

function reasonLabel(reason) {
  return PCO_REASONS.find((r) => r.value === reason)?.label || reason || "—";
}

function pcoBadgeClass(status) {
  const s = String(status || "").toUpperCase();
  if (s === "APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s === "REJECTED") return "border-red-200 bg-red-50 text-red-700";
  if (s === "PENDING") return "border-amber-200 bg-amber-50 text-amber-700";
  if (s === "DRAFT") return "border-slate-200 bg-slate-100 text-slate-600";
  if (s === "VOID") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function coBadgeClass(status) {
  const s = String(status || "").toUpperCase();
  if (s === "EXECUTED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s === "REJECTED") return "border-red-200 bg-red-50 text-red-700";
  if (s === "PENDING_OWNER") return "border-amber-200 bg-amber-50 text-amber-700";
  if (s === "DRAFT") return "border-slate-200 bg-slate-100 text-slate-600";
  if (s === "VOID") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function coPrettyStatus(status) {
  const s = String(status || "").toUpperCase();
  if (s === "PENDING_OWNER") return "Pending Owner";
  return s.replace(/_/g, " ");
}

const fieldClass =
  "mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

const labelClass = "text-xs font-semibold uppercase tracking-wide text-slate-500";

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl bg-[#0b1220] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#162033]";

const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50";

export default function ChangeOrdersPage() {
  const { projectId } = useParams();

  const [activeTab, setActiveTab] = useState("pco"); // "pco" | "co"

  const [pcos, setPcos] = useState([]);
  const [cos, setCos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");

  // PCO form
  const [showPcoForm, setShowPcoForm] = useState(false);
  const [pcoForm, setPcoForm] = useState({
    title: "",
    reason: "OWNER_REQUEST",
    description: "",
    potential_impact: "",
    days_impact: "",
  });
  const [pcoBusy, setPcoBusy] = useState(false);

  // CO form
  const [showCoForm, setShowCoForm] = useState(false);
  const [coForm, setCoForm] = useState({
    title: "",
    description: "",
    amount: "",
    days_impact: "",
  });
  const [coBusy, setCoBusy] = useState(false);

  // Expanded cards
  const [expandedPco, setExpandedPco] = useState(null);
  const [expandedCo, setExpandedCo] = useState(null);

  // Status action busy
  const [statusBusy, setStatusBusy] = useState({});

  // Inline delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState({});

  const apiBase = useMemo(() => getApiBase(), []);

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

  async function loadPcos() {
    const res = await apiFetch(`/projects/${projectId}/change-events`);
    setPcos(Array.isArray(res) ? res : res?.items || []);
  }

  async function loadCos() {
    const res = await apiFetch(`/projects/${projectId}/change-orders`);
    setCos(Array.isArray(res) ? res : res?.items || []);
  }

  async function loadAll() {
    await Promise.all([loadPcos(), loadCos()]);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        await loadProjectMeta();
        await loadAll();
      } catch (e) {
        if (!cancelled) setError(e?.message || "Error loading change orders");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (projectId) load();
    return () => { cancelled = true; };
  }, [projectId]);

  // PCO summaries
  const pendingPcoImpact = useMemo(() => {
    return pcos
      .filter((p) => {
        const s = String(p.status || "").toUpperCase();
        return s === "PENDING" || s === "DRAFT";
      })
      .reduce((sum, p) => sum + (Number(p.potential_impact) || 0), 0);
  }, [pcos]);

  // CO summaries
  const executedCoTotal = useMemo(() => {
    return cos
      .filter((c) => String(c.status || "").toUpperCase() === "EXECUTED")
      .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  }, [cos]);

  const totalDaysAdded = useMemo(() => {
    return cos.reduce((sum, c) => sum + (Number(c.days_impact) || 0), 0);
  }, [cos]);

  async function submitPco(e) {
    e.preventDefault();
    setPcoBusy(true);
    setError("");
    try {
      const body = {
        title: pcoForm.title,
        reason: pcoForm.reason,
        description: pcoForm.description,
        potential_impact: Number(pcoForm.potential_impact) || 0,
        days_impact: Number(pcoForm.days_impact) || 0,
      };
      await apiFetch(`/projects/${projectId}/change-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setPcoForm({ title: "", reason: "OWNER_REQUEST", description: "", potential_impact: "", days_impact: "" });
      setShowPcoForm(false);
      await loadPcos();
    } catch (e2) {
      setError(e2?.message || "Error creating PCO");
    } finally {
      setPcoBusy(false);
    }
  }

  async function submitCo(e) {
    e.preventDefault();
    setCoBusy(true);
    setError("");
    try {
      const body = {
        title: coForm.title,
        description: coForm.description,
        amount: Number(coForm.amount) || 0,
        days_impact: Number(coForm.days_impact) || 0,
      };
      await apiFetch(`/projects/${projectId}/change-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setCoForm({ title: "", description: "", amount: "", days_impact: "" });
      setShowCoForm(false);
      await loadCos();
    } catch (e2) {
      setError(e2?.message || "Error creating CO");
    } finally {
      setCoBusy(false);
    }
  }

  async function updatePcoStatus(id, status) {
    setStatusBusy((prev) => ({ ...prev, [id]: true }));
    setError("");
    try {
      await apiFetch(`/change-event/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await loadPcos();
    } catch (e) {
      setError(e?.message || "Error updating status");
    } finally {
      setStatusBusy((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function deletePco(id) {
    if (!deleteConfirm[id]) {
      setDeleteConfirm((prev) => ({ ...prev, [id]: true }));
      return;
    }
    setDeleteConfirm((prev) => ({ ...prev, [id]: false }));
    setError("");
    try {
      await apiFetch(`/change-event/${id}`, { method: "DELETE" });
      setPcos((prev) => prev.filter((x) => x.id !== id));
      if (expandedPco === id) setExpandedPco(null);
    } catch (e) {
      setError(e?.message || "Error deleting change event");
    }
  }

  async function deleteCo(id) {
    if (!deleteConfirm[id]) {
      setDeleteConfirm((prev) => ({ ...prev, [id]: true }));
      return;
    }
    setDeleteConfirm((prev) => ({ ...prev, [id]: false }));
    setError("");
    try {
      await apiFetch(`/change-order/${id}`, { method: "DELETE" });
      setCos((prev) => prev.filter((x) => x.id !== id));
      if (expandedCo === id) setExpandedCo(null);
    } catch (e) {
      setError(e?.message || "Error deleting change order");
    }
  }

  async function updateCoStatus(id, status) {
    setStatusBusy((prev) => ({ ...prev, [id]: true }));
    setError("");
    try {
      await apiFetch(`/change-order/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await loadCos();
    } catch (e) {
      setError(e?.message || "Error updating status");
    } finally {
      setStatusBusy((prev) => ({ ...prev, [id]: false }));
    }
  }

  const statusCoLabels = {
    PENDING_OWNER: "Pending Owner",
    EXECUTED: "Executed",
    REJECTED: "Rejected",
    VOID: "Void",
    DRAFT: "Draft",
  };

  return (
    <div className="space-y-4">
      <ProjectHeader projectName={projectName || "Project"} location={projectLocation || ""} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Change Orders</h1>
          <p className="mt-1 text-sm text-slate-500">Manage change events (PCOs) and executed change orders (COs)</p>
        </div>
        <button
          type="button"
          onClick={async () => { setError(""); try { await loadAll(); } catch (e) { setError(e?.message || "Error"); } }}
          className={secondaryButtonClass}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: "pco", label: "Change Events (PCOs)" },
          { key: "co", label: "Change Orders (COs)" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-2xl border px-5 py-2.5 text-sm font-semibold transition ${
              activeTab === tab.key
                ? "border-[#0b1220] bg-[#0b1220] text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
          Loading...
        </div>
      ) : null}

      {/* PCO Tab */}
      {!loading && activeTab === "pco" ? (
        <div className="space-y-4">
          {/* PCO Summary */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending / Draft Impact</div>
              <div className="mt-2 text-xl font-bold text-amber-600">{fmtDollars(pendingPcoImpact)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Change Events</div>
              <div className="mt-2 text-xl font-bold text-slate-900">{pcos.length}</div>
            </div>
          </div>

          {/* New PCO button */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Change Events (PCOs)</h2>
              <button
                type="button"
                onClick={() => setShowPcoForm((v) => !v)}
                className={primaryButtonClass}
              >
                {showPcoForm ? "Cancel" : "+ New PCO"}
              </button>
            </div>

            {showPcoForm ? (
              <form onSubmit={submitPco} className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="mb-3 text-sm font-semibold text-slate-800">New Change Event (PCO)</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Title</label>
                    <input
                      value={pcoForm.title}
                      onChange={(e) => setPcoForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. Owner requested additional lighting"
                      required
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Reason</label>
                    <select
                      value={pcoForm.reason}
                      onChange={(e) => setPcoForm((f) => ({ ...f, reason: e.target.value }))}
                      className={fieldClass}
                    >
                      {PCO_REASONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Potential Impact ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pcoForm.potential_impact}
                      onChange={(e) => setPcoForm((f) => ({ ...f, potential_impact: e.target.value }))}
                      placeholder="0.00"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Days Impact</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={pcoForm.days_impact}
                      onChange={(e) => setPcoForm((f) => ({ ...f, days_impact: e.target.value }))}
                      placeholder="0"
                      className={fieldClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Description</label>
                    <textarea
                      value={pcoForm.description}
                      onChange={(e) => setPcoForm((f) => ({ ...f, description: e.target.value }))}
                      rows={3}
                      placeholder="Describe the change event..."
                      className={fieldClass}
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setShowPcoForm(false)} className={secondaryButtonClass}>
                    Cancel
                  </button>
                  <button type="submit" disabled={pcoBusy} className={`${primaryButtonClass} ${pcoBusy ? "opacity-60 cursor-not-allowed" : ""}`}>
                    {pcoBusy ? "Saving..." : "Save PCO"}
                  </button>
                </div>
              </form>
            ) : null}
          </div>

          {/* PCO list */}
          {pcos.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
              No change events yet. Create one above.
            </div>
          ) : (
            <div className="space-y-3">
              {pcos.map((pco) => {
                const isExpanded = expandedPco === pco.id;
                const status = String(pco.status || "DRAFT").toUpperCase();

                return (
                  <div key={pco.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <button
                      type="button"
                      className="w-full p-4 text-left"
                      onClick={() => setExpandedPco(isExpanded ? null : pco.id)}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {pco.number ? (
                              <span className="text-xs font-mono font-semibold text-slate-500">
                                PCO-{pco.number}
                              </span>
                            ) : null}
                            <span className="font-semibold text-slate-900">{pco.title || "Untitled"}</span>
                            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${pcoBadgeClass(status)}`}>
                              {status}
                            </span>
                            {pco.reason ? (
                              <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                                {reasonLabel(pco.reason)}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                            <span>
                              Impact:{" "}
                              <span className="font-semibold text-slate-900">
                                {fmtDollars(pco.potential_impact)}
                              </span>
                            </span>
                            {pco.days_impact ? (
                              <span>
                                Days:{" "}
                                <span className="font-semibold text-slate-900">{pco.days_impact}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400 sm:shrink-0">
                          {isExpanded ? "▲ Collapse" : "▼ Expand"}
                        </div>
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                        {pco.description ? (
                          <p className="mb-4 text-sm text-slate-700 whitespace-pre-line">{pco.description}</p>
                        ) : (
                          <p className="mb-4 text-sm text-slate-400 italic">No description provided.</p>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          {status !== "APPROVED" && status !== "VOID" ? (
                            <button
                              type="button"
                              disabled={!!statusBusy[pco.id]}
                              onClick={() => updatePcoStatus(pco.id, "APPROVED")}
                              className="inline-flex items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                            >
                              Approve
                            </button>
                          ) : null}
                          {status !== "REJECTED" && status !== "VOID" ? (
                            <button
                              type="button"
                              disabled={!!statusBusy[pco.id]}
                              onClick={() => updatePcoStatus(pco.id, "REJECTED")}
                              className="inline-flex items-center rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          ) : null}
                          {deleteConfirm[pco.id] ? (
                            <>
                              <span className="text-sm text-slate-600">Are you sure?</span>
                              <button
                                type="button"
                                onClick={() => deletePco(pco.id)}
                                className="inline-flex items-center rounded-2xl border border-red-300 bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                              >
                                Yes, Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirm((prev) => ({ ...prev, [pco.id]: false }))}
                                className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => deletePco(pco.id)}
                              className="inline-flex items-center rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* CO Tab */}
      {!loading && activeTab === "co" ? (
        <div className="space-y-4">
          {/* CO Summary */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Executed Amount</div>
              <div className="mt-2 text-xl font-bold text-emerald-600">{fmtDollars(executedCoTotal)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Days Added</div>
              <div className="mt-2 text-xl font-bold text-slate-900">{totalDaysAdded}</div>
            </div>
          </div>

          {/* New CO button */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Change Orders (COs)</h2>
              <button
                type="button"
                onClick={() => setShowCoForm((v) => !v)}
                className={primaryButtonClass}
              >
                {showCoForm ? "Cancel" : "+ New CO"}
              </button>
            </div>

            {showCoForm ? (
              <form onSubmit={submitCo} className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="mb-3 text-sm font-semibold text-slate-800">New Change Order (CO)</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Title</label>
                    <input
                      value={coForm.title}
                      onChange={(e) => setCoForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. Additional lighting package"
                      required
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Amount ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={coForm.amount}
                      onChange={(e) => setCoForm((f) => ({ ...f, amount: e.target.value }))}
                      placeholder="0.00"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Days Impact</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={coForm.days_impact}
                      onChange={(e) => setCoForm((f) => ({ ...f, days_impact: e.target.value }))}
                      placeholder="0"
                      className={fieldClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Description</label>
                    <textarea
                      value={coForm.description}
                      onChange={(e) => setCoForm((f) => ({ ...f, description: e.target.value }))}
                      rows={3}
                      placeholder="Describe the change order..."
                      className={fieldClass}
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setShowCoForm(false)} className={secondaryButtonClass}>
                    Cancel
                  </button>
                  <button type="submit" disabled={coBusy} className={`${primaryButtonClass} ${coBusy ? "opacity-60 cursor-not-allowed" : ""}`}>
                    {coBusy ? "Saving..." : "Save CO"}
                  </button>
                </div>
              </form>
            ) : null}
          </div>

          {/* CO list */}
          {cos.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
              No change orders yet. Create one above.
            </div>
          ) : (
            <div className="space-y-3">
              {cos.map((co) => {
                const isExpanded = expandedCo === co.id;
                const status = String(co.status || "DRAFT").toUpperCase();

                return (
                  <div key={co.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <button
                      type="button"
                      className="w-full p-4 text-left"
                      onClick={() => setExpandedCo(isExpanded ? null : co.id)}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {co.number ? (
                              <span className="text-xs font-mono font-semibold text-slate-500">
                                CO-{co.number}
                              </span>
                            ) : null}
                            <span className="font-semibold text-slate-900">{co.title || "Untitled"}</span>
                            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${coBadgeClass(status)}`}>
                              {coPrettyStatus(status)}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                            <span>
                              Amount:{" "}
                              <span className="font-semibold text-slate-900">{fmtDollars(co.amount)}</span>
                            </span>
                            {co.days_impact ? (
                              <span>
                                Days:{" "}
                                <span className="font-semibold text-slate-900">{co.days_impact}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400 sm:shrink-0">
                          {isExpanded ? "▲ Collapse" : "▼ Expand"}
                        </div>
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                        {co.description ? (
                          <p className="mb-4 text-sm text-slate-700 whitespace-pre-line">{co.description}</p>
                        ) : (
                          <p className="mb-4 text-sm text-slate-400 italic">No description provided.</p>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          {status === "DRAFT" ? (
                            <button
                              type="button"
                              disabled={!!statusBusy[co.id]}
                              onClick={() => updateCoStatus(co.id, "PENDING_OWNER")}
                              className="inline-flex items-center rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                            >
                              Submit to Owner
                            </button>
                          ) : null}
                          {status === "PENDING_OWNER" ? (
                            <>
                              <button
                                type="button"
                                disabled={!!statusBusy[co.id]}
                                onClick={() => updateCoStatus(co.id, "EXECUTED")}
                                className="inline-flex items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                              >
                                Mark Executed
                              </button>
                              <button
                                type="button"
                                disabled={!!statusBusy[co.id]}
                                onClick={() => updateCoStatus(co.id, "REJECTED")}
                                className="inline-flex items-center rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </>
                          ) : null}
                          {(status === "EXECUTED" || status === "REJECTED") ? (
                            <button
                              type="button"
                              disabled={!!statusBusy[co.id]}
                              onClick={() => updateCoStatus(co.id, "VOID")}
                              className="inline-flex items-center rounded-2xl border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
                            >
                              Void
                            </button>
                          ) : null}
                          {deleteConfirm[co.id] ? (
                            <>
                              <span className="text-sm text-slate-600">Are you sure?</span>
                              <button
                                type="button"
                                onClick={() => deleteCo(co.id)}
                                className="inline-flex items-center rounded-2xl border border-red-300 bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                              >
                                Yes, Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirm((prev) => ({ ...prev, [co.id]: false }))}
                                className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => deleteCo(co.id)}
                              className="inline-flex items-center rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
