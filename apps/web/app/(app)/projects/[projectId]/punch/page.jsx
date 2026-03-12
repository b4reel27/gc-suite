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

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;

  if (typeof window !== "undefined") {
    return `http://${window.location.hostname}:3005`;
  }

  return "http://localhost:3005";
}

export default function PunchPage() {
  const { projectId } = useParams();

  const apiBase = useMemo(() => getApiBase(), []);

  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [newTrade, setNewTrade] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");

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
          msg = data?.error || msg;
        } else {
          msg = await res.text();
        }
      } catch {}

      throw new Error(msg);
    }

    if (ct.includes("application/json")) return res.json();
    return null;
  }

  async function refreshIssues() {
    const res = await apiFetch(`/projects/${projectId}/punch`);
    setItems(Array.isArray(res) ? res : []);
  }

  async function loadProjectMeta() {
    try {
      const projects = await apiFetch(`/projects`);
      const p = projects.find((x) => x.id === projectId);

      if (p) {
        setProjectName(p.name || "");
        setProjectLocation(p.location || "");
      }
    } catch {}
  }

  useEffect(() => {
    async function load() {
      try {
        await loadProjectMeta();

        const [meRes, compRes] = await Promise.all([
          apiFetch(`/projects/${projectId}/me`),
          apiFetch(`/projects/${projectId}/companies`),
        ]);

        setMe(meRes);
        setCompanies(compRes || []);

        await refreshIssues();
      } catch (e) {
        setError(e.message);
      }
    }

    if (projectId) load();
  }, [projectId]);

  async function addIssue(e) {
    e.preventDefault();

    try {
      const payload = {
        title: newTitle,
        trade: newTrade || null,
        location: newLocation || null,
        assigned_company_id: newCompanyId || null,
      };

      const created = await apiFetch(`/projects/${projectId}/punch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      setItems((prev) => [created, ...prev]);

      setNewTitle("");
      setNewTrade("");
      setNewLocation("");
      setNewCompanyId("");
    } catch (e) {
      setError(e.message);
    }
  }

  async function deleteIssue(issueId) {
    if (!confirm("Delete issue?")) return;

    try {
      await apiFetch(`/punch/${issueId}`, { method: "DELETE" });
      setItems((prev) => prev.filter((x) => x.id !== issueId));
    } catch (e) {
      setError(e.message);
    }
  }

  const iAmGC = isGcRole(me?.role);

  return (
    <div className="space-y-4">

      <ProjectHeader
        projectName={projectName || "Project"}
        location={projectLocation || ""}
      />

      <div>
        <h1 className="text-2xl font-bold">Field Issues</h1>
        {me?.role && (
          <p className="text-sm text-slate-600">
            Signed in as <b>{me.role}</b>
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}

      {iAmGC && (
        <form onSubmit={addIssue} className="rounded-xl border p-4 bg-white">
          <h2 className="font-semibold mb-2">Add Field Issue</h2>

          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Title"
            required
            className="border p-2 rounded w-full mb-2"
          />

          <input
            value={newTrade}
            onChange={(e) => setNewTrade(e.target.value)}
            placeholder="Trade"
            className="border p-2 rounded w-full mb-2"
          />

          <input
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            placeholder="Location"
            className="border p-2 rounded w-full mb-2"
          />

          <button className="bg-slate-900 text-white px-4 py-2 rounded">
            + Add Issue
          </button>
        </form>
      )}

      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="border rounded-xl p-4 bg-white">

            <div className="flex justify-between">

              <div>
                <div className="font-semibold">{it.title}</div>
                <div className="text-sm text-slate-600">
                  {it.trade} • {it.location}
                </div>
              </div>

              {iAmGC && (
                <button
                  onClick={() => deleteIssue(it.id)}
                  className="text-red-600"
                >
                  Delete
                </button>
              )}
            </div>

          </div>
        ))}

        {!items.length && (
          <div className="text-sm text-slate-600">
            No issues yet.
          </div>
        )}
      </div>

    </div>
  );
}