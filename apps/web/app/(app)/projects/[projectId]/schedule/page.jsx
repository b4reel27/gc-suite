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

export default function SchedulePage() {
  const { projectId } = useParams();

  const [items, setItems] = useState([]);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  // Project header meta
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");

  // Create fields
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Filters
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  function getApiBase() {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (typeof window !== "undefined" && window?.location?.hostname) {
      return `http://${window.location.hostname}:3005`;
    }
    return "http://localhost:3005";
  }

  const apiBase = useMemo(() => getApiBase(), []);

  async function apiFetch(path, opts = {}) {
    const base = apiBase || getApiBase();
    const token = getToken();

    if (!token) throw new Error("Not logged in (token missing). Go to Login and sign in again.");

    const res = await fetch(`${base}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });

    const ct = res.headers.get("content-type") || "";
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Request failed (${res.status})`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const iAmGC = isGcRole(me?.role);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter((it) => {
      const s = statusUpper(it.status);
      const statusOk = filter === "ALL" ? true : s === filter;
      const qOk = q
        ? `${it.title || ""} ${it.notes || ""} ${it.date || ""}`.toLowerCase().includes(q)
        : true;
      return statusOk && qOk;
    });
  }, [items, filter, query]);

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
    } catch (e2) {
      setError(e2?.message || "Error creating schedule item");
    }
  }

  async function action(itemId, actionPath) {
    setError("");
    try {
      const updated = await apiFetch(`/schedule-item/${itemId}/${actionPath}`, { method: "POST" });
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
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {/* Create */}
      <form onSubmit={addItem} className="rounded-2xl border border-slate-200 bg-white p-4">
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

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
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
              placeholder="Search title, notes, date…"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map((it) => {
          const s = statusUpper(it.status);
          const dateLabel = it.date ? String(it.date).slice(0, 10) : "";

          return (
            <div key={it.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{it.title}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {dateLabel ? (
                      <>
                        Date: <b>{dateLabel}</b>
                      </>
                    ) : null}
                    {it.notes ? (
                      <>
                        {dateLabel ? " • " : ""}
                        Notes: <b>{it.notes}</b>
                      </>
                    ) : null}
                    {" • "}Status: <b>{s}</b>
                  </div>
                </div>

                {/* Actions */}
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
    </div>
  );
}