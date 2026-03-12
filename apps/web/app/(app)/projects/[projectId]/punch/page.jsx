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

function statusBadgeClass(status) {
  const s = statusUpper(status);

  if (s === "OPEN") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  if (s === "IN_PROGRESS") {
    return "bg-blue-100 text-blue-800 border-blue-200";
  }
  if (s === "DONE") {
    return "bg-purple-100 text-purple-800 border-purple-200";
  }
  if (s === "VERIFIED") {
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  }
  if (s === "CLOSED") {
    return "bg-slate-200 text-slate-700 border-slate-300";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

function prettyStatus(status) {
  return statusUpper(status).replaceAll("_", " ");
}

function StatCard({ title, value, subtext }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      {subtext ? <div className="mt-1 text-xs text-slate-500">{subtext}</div> : null}
    </div>
  );
}

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;

  if (typeof window !== "undefined" && window?.location?.hostname) {
    return `http://${window.location.hostname}:3005`;
  }

  return "http://localhost:3005";
}

export default function PunchPage() {
  const { projectId } = useParams();

  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");

  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [trade, setTrade] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [newTrade, setNewTrade] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");

  const [uploading, setUploading] = useState({});
  const [savingStatus, setSavingStatus] = useState({});

  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerTitle, setPhotoViewerTitle] = useState("");
  const [photoViewerPhotos, setPhotoViewerPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  const apiBase = useMemo(() => getApiBase(), []);

  function fileUrl(filePath) {
    if (!filePath) return "";
    if (String(filePath).startsWith("http")) return filePath;
    return `${apiBase}${String(filePath).startsWith("/") ? "" : "/"}${filePath}`;
  }

  function getAssignedCompanyName(issue) {
    if (issue?.assigned_company_name) return issue.assigned_company_name;
    if (!issue?.assigned_company_id) return "";
    const match = companies.find((c) => c.id === issue.assigned_company_id);
    return match?.name || "";
  }

  async function apiFetch(path, opts = {}) {
    const token = getToken();

    if (!token) {
      throw new Error("Not logged in");
    }

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

  async function refreshIssues() {
    const res = await apiFetch(`/projects/${projectId}/punch`);
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
        ? `${it.title || ""} ${it.location || ""} ${it.trade || ""} ${
            it.created_by_name || ""
          } ${it.assigned_company_name || ""}`
            .toLowerCase()
            .includes(q)
        : true;

      return statusOk && tradeOk && qOk;
    });
  }, [items, filter, query, trade]);

  const stats = useMemo(() => {
    const list = items || [];

    return {
      total: list.length,
      open: list.filter((it) => statusUpper(it.status) === "OPEN").length,
      inProgress: list.filter((it) => statusUpper(it.status) === "IN_PROGRESS").length,
      done: list.filter((it) => statusUpper(it.status) === "DONE").length,
      verified: list.filter((it) => statusUpper(it.status) === "VERIFIED").length,
      photos: list.reduce((sum, it) => sum + Number(it.photo_count || 0), 0),
    };
  }, [items]);

  const tradeOptions = useMemo(() => {
    const set = new Set();

    (items || []).forEach((it) => {
      if (it.trade) set.add(String(it.trade));
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

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

      const created = await apiFetch(`/projects/${projectId}/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (created?.id) {
        setItems((prev) => [created, ...(prev || [])]);
        await refreshIssues();
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
    setSavingStatus((m) => ({ ...(m || {}), [issueId]: true }));

    try {
      const updated = await apiFetch(`/punch/${issueId}/${actionPath}`, {
        method: "POST",
      });

      if (updated?.id) {
        setItems((prev) => prev.map((p) => (p.id === issueId ? updated : p)));
        await refreshIssues();
      } else {
        await refreshIssues();
      }
    } catch (e) {
      setError(e?.message || "Error updating status");
    } finally {
      setSavingStatus((m) => ({ ...(m || {}), [issueId]: false }));
    }
  }

  async function deleteIssue(issueId) {
    const ok = window.confirm("Delete this issue? This cannot be undone.");
    if (!ok) return;

    setError("");

    try {
      await apiFetch(`/punch/${issueId}`, { method: "DELETE" });
      setItems((prev) => (prev || []).filter((p) => p.id !== issueId));
    } catch (e) {
      setError(e?.message || "Error deleting issue");
    }
  }

  async function uploadPhoto(issueId, file, inputEl) {
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

      if (inputEl) inputEl.value = "";
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
      <ProjectHeader
        projectName={projectName || "Project"}
        location={projectLocation || ""}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Field Issues</h1>
          {me?.role ? (
            <p className="mt-1 text-sm text-slate-600">
              Signed in as <span className="font-semibold text-slate-900">{me.role}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              API: <span className="font-mono">{apiBase}</span>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={refreshIssues}
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard title="Total" value={stats.total} />
        <StatCard title="Open" value={stats.open} />
        <StatCard title="In Progress" value={stats.inProgress} />
        <StatCard title="Done" value={stats.done} />
        <StatCard title="Verified" value={stats.verified} />
        <StatCard title="Photos" value={stats.photos} />
      </div>

      {iAmGC ? (
        <form
          onSubmit={addIssue}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-3">
            <h2 className="text-base font-semibold text-slate-900">Add Field Issue</h2>
            <p className="mt-1 text-sm text-slate-500">
              Fast entry for supers and PMs in the field.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-600">Title</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Example: Caulk around windows at rear elevation"
                required
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Trade</label>
              <input
                value={newTrade}
                onChange={(e) => setNewTrade(e.target.value)}
                placeholder="Example: Finish / Glazing / Electrical"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Location</label>
              <input
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="Example: Sales floor, north wall"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-600">
                Assigned Company (optional)
              </label>
              <select
                value={newCompanyId}
                onChange={(e) => setNewCompanyId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
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
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                + Add Issue
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          Field issues can be updated here, but only GC users can create new issues.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-slate-900">Filter Issues</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs font-semibold text-slate-600">Status</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
            >
              <option value="ALL">ALL</option>
              <option value="OPEN">OPEN</option>
              <option value="IN_PROGRESS">IN PROGRESS</option>
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
              placeholder="Search title, trade, location, creator..."
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Trade Filter</label>
            <select
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
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

      <div className="space-y-3">
        {filtered.map((it) => {
          const s = statusUpper(it.status);
          const photoCount = Number(it.photo_count || 0);
          const latestPhotoUrl = it.latest_photo_path ? fileUrl(it.latest_photo_path) : "";
          const assignedCompanyName = getAssignedCompanyName(it);

          return (
            <div
              key={it.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">{it.title}</h3>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                          s
                        )}`}
                      >
                        {prettyStatus(s)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
                      <span>
                        Trade: <span className="font-medium text-slate-900">{it.trade || "—"}</span>
                      </span>
                      <span>
                        Location:{" "}
                        <span className="font-medium text-slate-900">{it.location || "—"}</span>
                      </span>
                      <span>
                        Created By:{" "}
                        <span className="font-medium text-slate-900">
                          {it.created_by_name || "—"}
                        </span>
                      </span>
                      <span>
                        Photos: <span className="font-medium text-slate-900">{photoCount}</span>
                      </span>
                      {assignedCompanyName ? (
                        <span>
                          Assigned:{" "}
                          <span className="font-medium text-slate-900">
                            {assignedCompanyName}
                          </span>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {iAmGC ? (
                    <div className="flex shrink-0">
                      <button
                        onClick={() => deleteIssue(it.id)}
                        className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 hover:bg-red-100"
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>

                {latestPhotoUrl ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        window.open(latestPhotoUrl, "_blank", "noopener,noreferrer")
                      }
                      className="overflow-hidden rounded-xl border border-slate-200 hover:opacity-90"
                      title="Open latest photo"
                    >
                      <img
                        src={latestPhotoUrl}
                        alt="Latest issue photo"
                        className="h-24 w-24 object-cover"
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
                  <div>
                    <button
                      type="button"
                      onClick={() => openPhotoViewer(it.id, it.title)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      View Photos
                    </button>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">
                    <span>{uploading[it.id] ? "Uploading..." : "Add Photo"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!!uploading[it.id]}
                      onChange={(e) =>
                        uploadPhoto(it.id, e.target.files?.[0], e.target)
                      }
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <button
                    onClick={() => setStatus(it.id, "start")}
                    disabled={!canStart(s) || !!savingStatus[it.id]}
                    className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 ${
                      !canStart(s) || savingStatus[it.id] ? "cursor-not-allowed opacity-40" : ""
                    }`}
                    type="button"
                  >
                    Start
                  </button>

                  <button
                    onClick={() => setStatus(it.id, "complete")}
                    disabled={!canDone(s) || !!savingStatus[it.id]}
                    className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 ${
                      !canDone(s) || savingStatus[it.id] ? "cursor-not-allowed opacity-40" : ""
                    }`}
                    type="button"
                  >
                    Done
                  </button>

                  <button
                    onClick={() => setStatus(it.id, "verify")}
                    disabled={!iAmGC || !canVerify(s) || !!savingStatus[it.id]}
                    className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 ${
                      !iAmGC || !canVerify(s) || savingStatus[it.id]
                        ? "cursor-not-allowed opacity-40"
                        : ""
                    }`}
                    type="button"
                    title={!iAmGC ? "GC only" : ""}
                  >
                    Verify
                  </button>

                  <button
                    onClick={() => setStatus(it.id, "close")}
                    disabled={!iAmGC || !canClose(s) || !!savingStatus[it.id]}
                    className={`rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:opacity-90 ${
                      !iAmGC || !canClose(s) || savingStatus[it.id]
                        ? "cursor-not-allowed opacity-40"
                        : ""
                    }`}
                    type="button"
                    title={!iAmGC ? "GC only" : ""}
                  >
                    Close
                  </button>
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
                            {photo.created_at
                              ? new Date(photo.created_at).toLocaleString()
                              : ""}
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