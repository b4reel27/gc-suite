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

  useEffect(() => {
    async function load() {
      const token = getToken();
      const storedActive = getActiveProjectId();

      if (!token) {
        window.location.href = "/login";
        return;
      }

      setActiveProjectId(storedActive);

      try {
        const res = await fetch(`${API_URL}/projects`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        if (res.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          localStorage.removeItem("activeProjectId");
          window.location.href = "/login";
          return;
        }

        if (!res.ok) throw new Error("Failed to load projects");

        const data = await res.json();
        setProjects(data || []);
      } catch {
        setError("Failed to load projects.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  function setActive(projectId) {
    localStorage.setItem("activeProjectId", projectId);
    setActiveProjectId(projectId);
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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
        <p className="mt-1 text-sm text-slate-500">Select an active project to continue.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!projects.length && !error ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No projects found.
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((project) => {
            const isActive = activeProjectId === project.id;

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

                  <div className="flex shrink-0 gap-2">
                    {!isActive ? (
                      <button
                        type="button"
                        onClick={() => setActive(project.id)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
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
