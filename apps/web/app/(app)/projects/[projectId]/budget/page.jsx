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

const CATEGORIES = ["General", "Labor", "Materials", "Subcontract", "Equipment", "Overhead"];

const fieldClass =
  "mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

const labelClass = "text-xs font-semibold uppercase tracking-wide text-slate-500";

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl bg-[#0b1220] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#162033]";

const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50";

function StatCard({ title, value, danger }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className={`mt-2 text-xl font-bold ${danger ? "text-red-600" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

export default function BudgetPage() {
  const { projectId } = useParams();

  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({ original: 0, approved_co: 0, committed: 0, actual: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    cost_code: "",
    description: "",
    category: "General",
    original_amount: "",
    committed_amount: "",
    actual_cost: "",
  });
  const [addBusy, setAddBusy] = useState(false);

  // Edit state: { [id]: formData } or null
  const [editRows, setEditRows] = useState({});
  const [editBusy, setEditBusy] = useState({});

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

  async function loadBudget() {
    const res = await apiFetch(`/projects/${projectId}/budget`);
    setItems(Array.isArray(res) ? res : res?.items || []);
    if (res?.totals) setTotals(res.totals);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        await loadProjectMeta();
        await loadBudget();
      } catch (e) {
        if (!cancelled) setError(e?.message || "Error loading budget");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (projectId) load();
    return () => { cancelled = true; };
  }, [projectId]);

  // Computed totals from items when server totals aren't available
  const computedTotals = useMemo(() => {
    const t = {
      original: Number(totals?.original) || 0,
      approved_co: Number(totals?.approved_co) || 0,
      committed: Number(totals?.committed) || 0,
      actual: Number(totals?.actual) || 0,
    };
    if (t.original === 0 && t.approved_co === 0 && items.length) {
      t.original = items.reduce((s, it) => s + (Number(it.original_amount) || 0), 0);
      t.approved_co = items.reduce((s, it) => s + (Number(it.approved_co_amount) || 0), 0);
      t.committed = items.reduce((s, it) => s + (Number(it.committed_amount) || 0), 0);
      t.actual = items.reduce((s, it) => s + (Number(it.actual_cost) || 0), 0);
    }
    return t;
  }, [totals, items]);

  const revisedContract = computedTotals.original + computedTotals.approved_co;
  const variance = revisedContract - computedTotals.actual;

  async function handleAdd(e) {
    e.preventDefault();
    setAddBusy(true);
    setError("");
    try {
      const body = {
        cost_code: addForm.cost_code,
        description: addForm.description,
        category: addForm.category,
        original_amount: Number(addForm.original_amount) || 0,
        committed_amount: Number(addForm.committed_amount) || 0,
        actual_cost: Number(addForm.actual_cost) || 0,
      };
      await apiFetch(`/projects/${projectId}/budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setAddForm({ cost_code: "", description: "", category: "General", original_amount: "", committed_amount: "", actual_cost: "" });
      setShowAddForm(false);
      await loadBudget();
    } catch (e2) {
      setError(e2?.message || "Error adding line item");
    } finally {
      setAddBusy(false);
    }
  }

  function startEdit(item) {
    setEditRows((prev) => ({
      ...prev,
      [item.id]: {
        cost_code: item.cost_code || "",
        description: item.description || "",
        category: item.category || "General",
        original_amount: item.original_amount ?? "",
        committed_amount: item.committed_amount ?? "",
        actual_cost: item.actual_cost ?? "",
      },
    }));
  }

  function cancelEdit(id) {
    setEditRows((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function saveEdit(id) {
    setEditBusy((prev) => ({ ...prev, [id]: true }));
    setError("");
    try {
      const form = editRows[id];
      const body = {
        cost_code: form.cost_code,
        description: form.description,
        category: form.category,
        original_amount: Number(form.original_amount) || 0,
        committed_amount: Number(form.committed_amount) || 0,
        actual_cost: Number(form.actual_cost) || 0,
      };
      await apiFetch(`/budget-item/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      cancelEdit(id);
      await loadBudget();
    } catch (e) {
      setError(e?.message || "Error saving changes");
    } finally {
      setEditBusy((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function deleteItem(id) {
    if (!window.confirm("Delete this budget line item? This cannot be undone.")) return;
    setError("");
    try {
      await apiFetch(`/budget-item/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((x) => x.id !== id));
      await loadBudget();
    } catch (e) {
      setError(e?.message || "Error deleting item");
    }
  }

  return (
    <div className="space-y-4">
      <ProjectHeader projectName={projectName || "Project"} location={projectLocation || ""} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Budget</h1>
          <p className="mt-1 text-sm text-slate-500">Project cost tracking and variance analysis</p>
        </div>
        <button
          type="button"
          onClick={async () => { setError(""); try { await loadBudget(); } catch (e) { setError(e?.message || "Error"); } }}
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

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Original Contract" value={fmtDollars(computedTotals.original)} />
        <StatCard title="Approved COs" value={fmtDollars(computedTotals.approved_co)} />
        <StatCard title="Revised Contract" value={fmtDollars(revisedContract)} />
        <StatCard title="Variance" value={fmtDollars(variance)} danger={variance < 0} />
      </div>

      {/* Add line item */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Line Items</h2>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className={primaryButtonClass}
          >
            {showAddForm ? "Cancel" : "+ Add Line Item"}
          </button>
        </div>

        {showAddForm ? (
          <form onSubmit={handleAdd} className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <div className="mb-3 text-sm font-semibold text-slate-800">New Budget Line Item</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={labelClass}>Cost Code</label>
                <input
                  value={addForm.cost_code}
                  onChange={(e) => setAddForm((f) => ({ ...f, cost_code: e.target.value }))}
                  placeholder="e.g. 03-100"
                  required
                  className={fieldClass}
                />
              </div>
              <div className="sm:col-span-1 lg:col-span-2">
                <label className={labelClass}>Description</label>
                <input
                  value={addForm.description}
                  onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Concrete Slab Work"
                  required
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Category</label>
                <select
                  value={addForm.category}
                  onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))}
                  className={fieldClass}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Original Amount ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={addForm.original_amount}
                  onChange={(e) => setAddForm((f) => ({ ...f, original_amount: e.target.value }))}
                  placeholder="0.00"
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Committed ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={addForm.committed_amount}
                  onChange={(e) => setAddForm((f) => ({ ...f, committed_amount: e.target.value }))}
                  placeholder="0.00"
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Actual Cost ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={addForm.actual_cost}
                  onChange={(e) => setAddForm((f) => ({ ...f, actual_cost: e.target.value }))}
                  placeholder="0.00"
                  className={fieldClass}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddForm(false)} className={secondaryButtonClass}>
                Cancel
              </button>
              <button type="submit" disabled={addBusy} className={`${primaryButtonClass} ${addBusy ? "opacity-60 cursor-not-allowed" : ""}`}>
                {addBusy ? "Saving..." : "Save Line Item"}
              </button>
            </div>
          </form>
        ) : null}

        {/* Table */}
        {loading ? (
          <div className="mt-4 text-sm text-slate-500">Loading budget...</div>
        ) : items.length === 0 ? (
          <div className="mt-4 text-sm text-slate-500">No budget line items yet. Add one above.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Cost Code</th>
                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Description</th>
                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Category</th>
                  <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Original</th>
                  <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Approved COs</th>
                  <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Committed</th>
                  <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actual</th>
                  <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Variance</th>
                  <th className="pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const isEditing = !!editRows[item.id];
                  const ef = editRows[item.id] || {};
                  const rowVariance =
                    (Number(item.original_amount) || 0) +
                    (Number(item.approved_co_amount) || 0) -
                    (Number(item.actual_cost) || 0);

                  if (isEditing) {
                    return (
                      <tr key={item.id} className="bg-blue-50">
                        <td className="py-2 pr-4">
                          <input
                            value={ef.cost_code}
                            onChange={(e) => setEditRows((prev) => ({ ...prev, [item.id]: { ...prev[item.id], cost_code: e.target.value } }))}
                            className="w-24 rounded-xl border border-black/10 bg-white px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            value={ef.description}
                            onChange={(e) => setEditRows((prev) => ({ ...prev, [item.id]: { ...prev[item.id], description: e.target.value } }))}
                            className="w-40 rounded-xl border border-black/10 bg-white px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            value={ef.category}
                            onChange={(e) => setEditRows((prev) => ({ ...prev, [item.id]: { ...prev[item.id], category: e.target.value } }))}
                            className="rounded-xl border border-black/10 bg-white px-2 py-1 text-sm"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            type="number"
                            step="0.01"
                            value={ef.original_amount}
                            onChange={(e) => setEditRows((prev) => ({ ...prev, [item.id]: { ...prev[item.id], original_amount: e.target.value } }))}
                            className="w-28 rounded-xl border border-black/10 bg-white px-2 py-1 text-right text-sm"
                          />
                        </td>
                        <td className="py-2 pr-4 text-right text-slate-500 text-xs">
                          {fmtDollars(item.approved_co_amount)}
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            type="number"
                            step="0.01"
                            value={ef.committed_amount}
                            onChange={(e) => setEditRows((prev) => ({ ...prev, [item.id]: { ...prev[item.id], committed_amount: e.target.value } }))}
                            className="w-28 rounded-xl border border-black/10 bg-white px-2 py-1 text-right text-sm"
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            type="number"
                            step="0.01"
                            value={ef.actual_cost}
                            onChange={(e) => setEditRows((prev) => ({ ...prev, [item.id]: { ...prev[item.id], actual_cost: e.target.value } }))}
                            className="w-28 rounded-xl border border-black/10 bg-white px-2 py-1 text-right text-sm"
                          />
                        </td>
                        <td className="py-2 pr-4" />
                        <td className="py-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => saveEdit(item.id)}
                              disabled={!!editBusy[item.id]}
                              className="rounded-xl bg-[#0b1220] px-3 py-1 text-xs font-semibold text-white hover:bg-[#162033] disabled:opacity-50"
                            >
                              {editBusy[item.id] ? "..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => cancelEdit(item.id)}
                              className="rounded-xl border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-700">{item.cost_code || "—"}</td>
                      <td className="py-2.5 pr-4 font-medium text-slate-900">{item.description || "—"}</td>
                      <td className="py-2.5 pr-4">
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                          {item.category || "—"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-slate-900">{fmtDollars(item.original_amount)}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{fmtDollars(item.approved_co_amount)}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{fmtDollars(item.committed_amount)}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{fmtDollars(item.actual_cost)}</td>
                      <td className={`py-2.5 pr-4 text-right font-semibold ${rowVariance < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {fmtDollars(rowVariance)}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            title="Edit"
                            className="rounded-xl border border-black/10 bg-white p-1.5 text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            {/* Pencil icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteItem(item.id)}
                            title="Delete"
                            className="rounded-xl border border-red-100 bg-red-50 p-1.5 text-red-600 hover:bg-red-100 transition-colors"
                          >
                            {/* Trash icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="border-t-2 border-slate-300">
                  <td colSpan={3} className="pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-slate-700">
                    Totals
                  </td>
                  <td className="pt-3 pb-1 pr-4 text-right font-bold text-slate-900">{fmtDollars(computedTotals.original)}</td>
                  <td className="pt-3 pb-1 pr-4 text-right font-bold text-slate-700">{fmtDollars(computedTotals.approved_co)}</td>
                  <td className="pt-3 pb-1 pr-4 text-right font-bold text-slate-700">{fmtDollars(computedTotals.committed)}</td>
                  <td className="pt-3 pb-1 pr-4 text-right font-bold text-slate-700">{fmtDollars(computedTotals.actual)}</td>
                  <td className={`pt-3 pb-1 pr-4 text-right font-bold ${variance < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {fmtDollars(variance)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
