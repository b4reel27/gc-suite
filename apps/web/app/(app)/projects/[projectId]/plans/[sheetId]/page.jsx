"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return String(iso);
  }
}

function getCookie(name) {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

export default function PlanViewerPage() {
  const params = useParams();
  const projectId = params?.projectId;
  const sheetId = params?.sheetId;

  const [plan, setPlan] = useState(null);
  const [selectedRev, setSelectedRev] = useState("");
  const [error, setError] = useState("");

  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");

  function apiBase() {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (typeof window !== "undefined" && window?.location?.hostname) {
      return `http://${window.location.hostname}:3005`;
    }
    return "http://localhost:3005";
  }

  function getToken() {
    if (typeof window === "undefined") return "";

    return (
      getCookie("gc_auth") ||
      getCookie("gc_token") ||
      localStorage.getItem("token") ||
      ""
    );
  }

  async function apiFetch(path, options = {}) {
    const token = getToken();

    if (!token) {
      throw new Error("Not logged in (token missing). Go to Login and sign in again.");
    }

    const res = await fetch(`${apiBase()}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data;
  }

  async function loadPlan() {
    setError("");

    const data = await apiFetch(
      `/projects/${projectId}/plans/sheets/${encodeURIComponent(sheetId)}`
    );

    setPlan(data);

    const defaultRev =
      data?.revisions?.find((r) => r.status === "Current")?.rev ||
      data?.revisions?.[0]?.rev ||
      "";

    setSelectedRev(defaultRev);
  }

  async function loadProjectMeta() {
    try {
      const list = await apiFetch("/projects");
      const p = Array.isArray(list) ? list.find((x) => x.id === projectId) : null;

      if (p) {
        setProjectName(p.name || "");
        setProjectLocation(p.location || "");
      }
    } catch {
      // Non-fatal
    }
  }

  useEffect(() => {
    if (!projectId || !sheetId) return;

    loadPlan().catch((e) => {
      setError(e instanceof Error ? e.message : "Failed to load plan.");
    });

    loadProjectMeta();
  }, [projectId, sheetId]);

  const selected = useMemo(() => {
    if (!plan) return null;

    return (
      plan.revisions?.find((r) => String(r.rev) === String(selectedRev)) ||
      plan.revisions?.[0] ||
      null
    );
  }, [plan, selectedRev]);

  if (error) {
    return (
      <div className="space-y-4">
        <div>
          <Link
            href={`/projects/${projectId}/plans`}
            className="text-sm text-slate-600 hover:underline"
          >
            ← Back to Plans
          </Link>

          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {projectName || "Project"}
          </h1>

          {projectLocation ? (
            <p className="mt-1 text-sm text-slate-600">{projectLocation}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="space-y-4">
        <div>
          <Link
            href={`/projects/${projectId}/plans`}
            className="text-sm text-slate-600 hover:underline"
          >
            ← Back to Plans
          </Link>

          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {projectName || "Project"}
          </h1>

          {projectLocation ? (
            <p className="mt-1 text-sm text-slate-600">{projectLocation}</p>
          ) : null}
        </div>

        <div className="text-sm text-slate-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/projects/${projectId}/plans`}
          className="text-sm text-slate-600 hover:underline"
        >
          ← Back to Plans
        </Link>

        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          {plan.sheetNo} — {plan.title}
        </h1>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          {projectName ? <span className="font-medium">{projectName}</span> : null}
          {projectLocation ? <span>• {projectLocation}</span> : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs ring-1 ring-slate-200">
            {plan.discipline}
          </span>
          <span className="text-xs text-slate-500">Sheet ID:</span>
          <span className="font-mono text-xs">{plan.sheetId}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-sm text-slate-600">
          {selected ? (
            <>
              Selected revision:{" "}
              <span className="font-semibold text-slate-900">R{selected.rev}</span>
              {selected.date ? <> • {fmtDate(selected.date)}</> : null}
            </>
          ) : (
            "No revision selected"
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">Revision</label>

          <select
            value={selectedRev}
            onChange={(e) => setSelectedRev(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {(plan.revisions || []).map((r) => (
              <option key={r.rev} value={r.rev}>
                R{r.rev} • {r.status}
                {r.date ? ` • ${fmtDate(r.date)}` : ""}
              </option>
            ))}
          </select>

          {selected?.fileUrl ? (
            <a
              href={`${apiBase()}${selected.fileUrl}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:opacity-90"
            >
              Open PDF ↗
            </a>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(plan.revisions || []).map((r) => {
            const active = String(r.rev) === String(selectedRev);

            const badgeClass =
              r.status === "Current"
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : r.status === "Pending"
                ? "bg-amber-50 text-amber-800 ring-amber-200"
                : "bg-slate-50 text-slate-700 ring-slate-200";

            return (
              <button
                key={r.rev}
                type="button"
                onClick={() => setSelectedRev(r.rev)}
                className={`rounded-xl px-3 py-2 text-sm ring-1 ${
                  active
                    ? "bg-slate-900 text-white ring-slate-900"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                R{r.rev}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ring-1 ${badgeClass}`}>
                  {r.status}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 text-sm text-slate-600">
          {selected ? (
            <>
              Viewing revision <span className="font-semibold text-slate-900">R{selected.rev}</span>
              {selected.date ? <> from {fmtDate(selected.date)}</> : null}
            </>
          ) : (
            "Select a revision to view."
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {selected?.fileUrl ? (
          <iframe
            title={`Plan ${plan.sheetNo} rev ${selected.rev}`}
            src={`${apiBase()}${selected.fileUrl}`}
            className="h-[75vh] w-full"
          />
        ) : (
          <div className="p-6 text-sm text-slate-600">
            No PDF uploaded for this revision yet.
          </div>
        )}
      </div>
    </div>
  );
}