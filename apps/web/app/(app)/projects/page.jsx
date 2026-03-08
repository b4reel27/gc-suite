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
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (res.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          localStorage.removeItem("activeProjectId");
          window.location.href = "/login";
          return;
        }

        if (!res.ok) {
          throw new Error("Failed to load projects");
        }

        const data = await res.json();
        setProjects(data || []);
      } catch (err) {
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
    return <div className="p-6">Loading projects...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Projects</h1>
        <p className="mt-1 text-slate-600">Select an active project to continue.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!projects.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          No projects found.
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => {
            const isActive = activeProjectId === project.id;

            return (
              <div
                key={project.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{project.name}</h2>
                    <p className="text-sm text-slate-600">
                      {project.location || "No location"} · {project.role || "No role"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400 font-mono">{project.id}</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setActive(project.id)}
                      className={`rounded-xl px-3 py-2 text-sm ${
                        isActive
                          ? "bg-emerald-600 text-white"
                          : "border border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      {isActive ? "Active Project" : "Set Active"}
                    </button>

                    <Link
                      href={`/projects/${project.id}/plans`}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:opacity-90"
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