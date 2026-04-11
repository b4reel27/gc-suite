"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || "";
}

function getActiveProjectId() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("activeProjectId") || "";
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // New project modal
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Add member modal
  const [memberProjectId, setMemberProjectId] = useState(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("SUB");
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [memberSuccess, setMemberSuccess] = useState("");

  async function apiFetch(path, opts = {}) {
    const token = getToken();
    const res = await fetch(`${API_URL}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
      cache: "no-store",
    });
    if (!res.ok) {
      let msg = `Error ${res.status}`;
      try { const d = await res.json(); msg = d?.error || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  }

  async function loadProjects() {
    const token = getToken();
    if (!token) { window.location.href = "/login"; return; }
    try {
      const data = await apiFetch("/projects");
      setProjects(data || []);
    } catch {
      setError("Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const storedActive = getActiveProjectId();
    setActiveProjectId(storedActive);
    loadProjects();
  }, []);

  function setActive(projectId) {
    localStorage.setItem("activeProjectId", projectId);
    setActiveProjectId(projectId);
  }

  async function handleCreateProject(e) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const project = await apiFetch("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), location: newLocation.trim() }),
      });
      setProjects((p) => [...p, project]);
      setActive(project.id);
      setShowNew(false);
      setNewName("");
      setNewLocation("");
    } catch (e) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleAddMember(e) {
    e.preventDefault();
    setMemberError("");
    setMemberSuccess("");
    setAddingMember(true);
    try {
      const result = await apiFetch(`/projects/${memberProjectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: memberEmail.trim(), role: memberRole }),
      });
      setMemberSuccess(`${result.user?.name || result.user?.email} added as ${result.user?.role}`);
      setMemberEmail("");
    } catch (e) {
      setMemberError(e.message);
    } finally {
      setAddingMember(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
        Loading projects…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
          <p className="mt-1 text-sm text-slate-500">Select an active project to continue.</p>
        </div>
        <button
          type="button"
          onClick={() => { setShowNew(true); setCreateError(""); }}
          className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          + New Project
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {/* New Project Modal */}
      {showNew ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-slate-900">New Project</h2>
            <form onSubmit={handleCreateProject} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600">Project Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  placeholder="Eastside Medical Center"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600">Location <span className="font-normal text-slate-400">(optional)</span></label>
                <input
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="Texarkana, TX"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                />
              </div>
              {createError ? <p className="text-sm text-red-600">{createError}</p> : null}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create Project"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Add Member Modal */}
      {memberProjectId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-bold text-slate-900">Add Team Member</h2>
            <p className="mb-4 text-sm text-slate-500">They must have a GC Suite account first.</p>
            <form onSubmit={handleAddMember} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600">Email Address</label>
                <input
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  type="email"
                  required
                  placeholder="sub@contractor.com"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600">Role</label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:outline-none"
                >
                  <option value="GC_SUPER">GC Superintendent</option>
                  <option value="GC_PM">GC Project Manager</option>
                  <option value="SUB_SUPER">Sub Superintendent</option>
                  <option value="SUB_FOREMAN">Sub Foreman</option>
                  <option value="SUB">Subcontractor</option>
                </select>
              </div>
              {memberError ? <p className="text-sm text-red-600">{memberError}</p> : null}
              {memberSuccess ? (
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  ✓ {memberSuccess}
                </p>
              ) : null}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={addingMember || !memberEmail.trim()}
                  className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {addingMember ? "Adding…" : "Add Member"}
                </button>
                <button
                  type="button"
                  onClick={() => { setMemberProjectId(null); setMemberEmail(""); setMemberError(""); setMemberSuccess(""); }}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Done
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {!projects.length && !error ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <div className="text-3xl">🏗️</div>
          <div className="mt-2 text-sm font-semibold text-slate-700">No projects yet</div>
          <div className="mt-1 text-xs text-slate-500">Create your first project above.</div>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((project) => {
            const isActive = activeProjectId === project.id;
            const isGC = String(project.role || "").toUpperCase().startsWith("GC");

            return (
              <div
                key={project.id}
                className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                  isActive ? "border-emerald-300 ring-1 ring-emerald-200" : "border-slate-200"
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900">{project.name}</h2>
                      {isActive ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          Active
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {project.location || "No location"}
                      {project.role ? (
                        <span className="ml-2 font-medium text-slate-700">{project.role}</span>
                      ) : null}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-slate-400">{project.id}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {isGC ? (
                      <button
                        type="button"
                        onClick={() => { setMemberProjectId(project.id); setMemberError(""); setMemberSuccess(""); setMemberEmail(""); }}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        + Member
                      </button>
                    ) : null}
                    {!isActive ? (
                      <button
                        type="button"
                        onClick={() => setActive(project.id)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Set Active
                      </button>
                    ) : null}
                    <Link
                      href={`/projects/${project.id}/plans`}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
