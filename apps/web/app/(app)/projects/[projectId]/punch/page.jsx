"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ProjectHeader from "../../../../../components/ProjectHeader";

// ✅ Token: cookie gc_auth first, then legacy cookie names, then localStorage
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

export default function PunchPage() {
  const { projectId } = useParams();

  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  // Project header meta
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");

  // Filters
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [trade, setTrade] = useState("");

  // New issue
  const [newTitle, setNewTitle] = useState("");
  const [newTrade, setNewTrade] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");

  // Photo upload state per issue
  const [uploading, setUploading] = useState({}); // { [issueId]: boolean }

  // Photo viewer state
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerTitle, setPhotoViewerTitle] = useState("");
  const [photoViewerPhotos, setPhotoViewerPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  function getApiBase() {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (typeof window !== "undefined" && window?.location?.hostname) {
      return `http://${window.location.hostname}:3005`;
    }
    return "http://localhost:3005";
  }

  const apiBase = useMemo(() => getApiBase(), []);

  function fileUrl(filePath) {
    if (!filePath) return "";
    if (String(filePath).startsWith("http")) return filePath;
    return `${apiBase}${String(filePath).startsWith("/") ? "" : "/"}${filePath}`;
  }

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

  async function refreshIssues() {
    const res = await apiFetch(`/punch/${projectId}`);
    setItems(Array.isArray(res) ? res : res?.items || []);
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      try {
        await loadProjectMeta();

        const [meRes, compRes] = await Promise.all([
          apiFetch(`/projects/${projectId}/me`),
          apiFetch(`/projects/${projectId}/companies`),
        ]);

        if (cancelled) return;

        setMe(meRes);
        setCompanies(Array.isArray(compRes) ? compRes : compRes?.items || []);

        await refreshIssues();
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || "Error loading issues");
      }
    }

    if (projectId) load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return (items || []).filter((it) => {
      const status = statusUpper(it.status);

      const statusOk = filter === "ALL" ? true : status === filter;
      const tradeOk = trade
        ? String(it.trade || "").toUpperCase() === trade.toUpperCase()
        : true;

      const qOk = q
        ? `${it.title || ""} ${it.location || ""} ${it.trade || ""}`.toLowerCase().includes(q)
        : true;

      return statusOk && tradeOk && qOk;
    });
  }, [items, filter, query, trade]);

  async function addIssue(e) {
    e.preventDefault();
    setError("");

    try {
      const payload = {
        title: newTitle,
        trade: newTrade || null,
        location: newLocation || null,
        assigned_company_id: newCompanyId || null,
      };

      const created = await apiFetch(`/punch/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (created?.id) {
        setItems((prev) => [created, ...(prev || [])]);
      } else {
        await refreshIssues();
      }

      setNewTitle("");
      setNewTrade("");
      setNewLocation("");
      setNewCompanyId("");
    } catch (e2) {
      setError(e2?.message || "Error creating issue");
    }
  }

  async function setStatus(issueId, actionPath) {
    setError("");
    try {
      const updated = await apiFetch(`/punch/${issueId}/${actionPath}`, { method: "POST" });

      if (updated?.id) {
        setItems((prev) => prev.map((p) => (p.id === issueId ? updated : p)));
      } else {
        await refreshIssues();
      }
    } catch (e) {
      setError(e?.message || "Error updating status");
    }
  }

  async function deleteIssue(issueId) {
    setError("");
    try {
      await apiFetch(`/punch/${issueId}`, { method: "DELETE" });
      setItems((prev) => (prev || []).filter((p) => p.id !== issueId));
    } catch (e) {
      setError(e?.message || "Error deleting issue");
    }
  }

  async function uploadPhoto(issueId, file) {
    if (!file) return;
    setError("");

    setUploading((m) => ({ ...(m || {}), [issueId]: true }));
    try {
      const fd = new FormData();
      fd.append("photo", file);

      await apiFetch(`/punch/${issueId}/photo`, {
        method: "POST",
        body: fd,
      });

      await refreshIssues();
    } catch (e) {
      setError(e?.message || "Error uploading photo");
    } finally {
      setUploading((m) => ({ ...(m || {}), [issueId]: false }));
    }
  }

  async function openPhotoViewer(issueId, title) {
    setError("");
    setLoadingPhotos(true);
    setPhotoViewerOpen(true);
    setPhotoViewerTitle(title || "Issue Photos");
    setPhotoViewerPhotos([]);

    try {
      const photos = await apiFetch(`/punch/${issueId}/photos`);
      setPhotoViewerPhotos(Array.isArray(photos) ? photos : []);
    } catch (e) {
      setError(e?.message || "Error loading photos");
      setPhotoViewerPhotos([]);
    } finally {
      setLoadingPhotos(false);
    }
  }

  const tradeOptions = useMemo(() => {
    const set = new Set();
    (items || []).forEach((it) => {
      if (it.trade) set.add(String(it.trade));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const iAmGC = isGcRole(me?.role);

  function canStart(status) {
    const s = statusUpper(status);
    return s === "OPEN";
  }
  function canDone(status) {
    const s = statusUpper(status);
    return s === "OPEN" || s === "IN_PROGRESS";
  }
  function canVerify(status) {
    const s = statusUpper(status);
    return s === "DONE";
  }
  function canClose(status) {
    const s = statusUpper(status);
    return s === "VERIFIED";
  }

  return (
    <div className="space-y-4">
      <ProjectHeader projectName={projectName || "Project"} location={projectLocation || ""} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Issues</h1>
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
      <form onSubmit={addIssue} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Title</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Example: Caulk around windows at rear elevation"
              required
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Trade</label>
            <input
              value={newTrade}
              onChange={(e) => setNewTrade(e.target.value)}
              placeholder="Example: Finish / Glazing / Electrical"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Location</label>
            <input
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder="Example: Sales floor, north wall"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Assigned Company (optional)</label>
            <select
              value={newCompanyId}
              onChange={(e) => setNewCompanyId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Unassigned</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              + Add Issue
            </button>
          </div>
        </div>
      </form>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs font-semibold text-slate-600">Status</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="ALL">ALL</option>
              <option value="OPEN">OPEN</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="DONE">DONE</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Search</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, trade, location…"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Trade Filter</label>
            <select
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">All Trades</option>
              {tradeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map((it) => {
          const s = statusUpper(it.status);
          const photoCount = Number(it.photo_count || 0);
          const latestPhotoUrl = it.latest_photo_path ? fileUrl(it.latest_photo_path) : "";

          return (
            <div key={it.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900">{it.title}</div>

                  <div className="mt-1 text-xs text-slate-600">
                    {it.trade ? (
                      <>
                        Trade: <b>{it.trade}</b>
                      </>
                    ) : null}
                    {it.location ? (
                      <>
                        {" • "}Location: <b>{it.location}</b>
                      </>
                    ) : null}
                    {it.status ? (
                      <>
                        {" • "}Status: <b>{s}</b>
                      </>
                    ) : null}
                    {" • "}Photos: <b>{photoCount}</b>
                  </div>

                  {/* Latest photo thumbnail */}
                  {latestPhotoUrl ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => window.open(latestPhotoUrl, "_blank", "noopener,noreferrer")}
                        className="overflow-hidden rounded-xl border border-slate-200 hover:opacity-90"
                        title="Open latest photo"
                      >
                        <img
                          src={latestPhotoUrl}
                          alt="Latest issue photo"
                          className="h-20 w-20 object-cover"
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => openPhotoViewer(it.id, it.title)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        View Photos
                      </button>
                    </div>
                  ) : photoCount > 0 ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => openPhotoViewer(it.id, it.title)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        View Photos
                      </button>
                    </div>
                  ) : null}

                  {/* Photo upload */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">
                      <span>{uploading[it.id] ? "Uploading…" : "Add Photo"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={!!uploading[it.id]}
                        onChange={(e) => uploadPhoto(it.id, e.target.files?.[0])}
                      />
                    </label>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setStatus(it.id, "start")}
                    disabled={!canStart(s)}
                    className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 ${
                      !canStart(s) ? "cursor-not-allowed opacity-40" : ""
                    }`}
                    type="button"
                  >
                    Start
                  </button>

                  <button
                    onClick={() => setStatus(it.id, "complete")}
                    disabled={!canDone(s)}
                    className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 ${
                      !canDone(s) ? "cursor-not-allowed opacity-40" : ""
                    }`}
                    type="button"
                  >
                    Done
                  </button>

                  <button
                    onClick={() => setStatus(it.id, "verify")}
                    disabled={!iAmGC || !canVerify(s)}
                    className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 ${
                      !iAmGC || !canVerify(s) ? "cursor-not-allowed opacity-40" : ""
                    }`}
                    type="button"
                    title={!iAmGC ? "GC only" : ""}
                  >
                    Verify
                  </button>

                  <button
                    onClick={() => setStatus(it.id, "close")}
                    disabled={!iAmGC || !canClose(s)}
                    className={`rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:opacity-90 ${
                      !iAmGC || !canClose(s) ? "cursor-not-allowed opacity-40" : ""
                    }`}
                    type="button"
                    title={!iAmGC ? "GC only" : ""}
                  >
                    Close
                  </button>

                  {iAmGC ? (
                    <button
                      onClick={() => deleteIssue(it.id)}
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
            No issues match your filters.
          </div>
        ) : null}
      </div>

      {/* Photo viewer modal */}
      {photoViewerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <div className="text-base font-semibold text-slate-900">{photoViewerTitle}</div>
                <div className="text-xs text-slate-500">
                  {loadingPhotos ? "Loading photos..." : `${photoViewerPhotos.length} photo(s)`}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPhotoViewerOpen(false)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-4">
              {loadingPhotos ? (
                <div className="text-sm text-slate-600">Loading photos...</div>
              ) : photoViewerPhotos.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {photoViewerPhotos.map((photo) => {
                    const url = fileUrl(photo.file_path);
                    return (
                      <a
                        key={photo.id}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-2xl border border-slate-200 bg-white hover:shadow-md"
                      >
                        <img
                          src={url}
                          alt={photo.original_name || "Issue photo"}
                          className="h-48 w-full object-cover"
                        />
                        <div className="p-3">
                          <div className="truncate text-sm font-medium text-slate-900">
                            {photo.original_name || "Photo"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {photo.created_at ? new Date(photo.created_at).toLocaleString() : ""}
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-slate-600">No photos found for this issue.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}