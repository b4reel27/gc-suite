"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function AddSheetPage() {
  const { projectId } = useParams();
  const router = useRouter();

  const [sheetNo, setSheetNo] = useState("");
  const [sheetId, setSheetId] = useState("");
  const [title, setTitle] = useState("");
  const [discipline, setDiscipline] = useState("ARCH");
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [pdf, setPdf] = useState(null);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function apiBase() {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (typeof window !== "undefined" && window?.location?.hostname) {
      return `http://${window.location.hostname}:3005`;
    }
    return "http://localhost:3005";
  }

  function getToken() {
    if (typeof window === "undefined") return "";

    const cookieToken =
      document.cookie
        .split("; ")
        .find((c) => c.startsWith("gc_auth="))
        ?.split("=")[1] || "";

    return cookieToken || localStorage.getItem("token") || "";
  }

  async function upload() {
    try {
      setError("");

      if (!pdf) {
        throw new Error("Choose a PDF file first.");
      }

      if (!projectId) {
        throw new Error("Missing projectId in route.");
      }

      const token = getToken();
      if (!token) {
        throw new Error("Not logged in (token missing). Go to Login and sign in again.");
      }

      setSaving(true);

      const form = new FormData();
      form.append("pdf", pdf);
      form.append("sheetNo", sheetNo.trim());
      form.append("sheetId", sheetId.trim());
      form.append("title", title.trim());
      form.append("discipline", discipline);
      form.append("makeCurrent", makeCurrent ? "true" : "false");

      const res = await fetch(`${apiBase()}/projects/${projectId}/plans/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `Upload failed (${res.status})`);
      }

      const createdSheetId =
        data?.sheet?.sheetId || sheetId.trim() || sheetNo.trim();

      if (!createdSheetId) {
        router.push(`/projects/${projectId}/plans`);
        return;
      }

      router.push(`/projects/${projectId}/plans/${encodeURIComponent(createdSheetId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setSaving(false);
    }
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

        <h1 className="mt-2 text-2xl font-bold text-slate-900">Add Sheet</h1>

        <p className="mt-1 text-sm text-slate-600">
          Upload a PDF. We’ll auto-create the drawing log row + revision.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-slate-600">Sheet No</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={sheetNo}
              onChange={(e) => setSheetNo(e.target.value)}
              placeholder="A1.01"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">
              Sheet ID (optional)
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              placeholder="A101"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">Title</label>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Floor Plan"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-slate-600">Discipline</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
            >
              {["ARCH", "STRUCT", "ELEC", "MECH", "CIVIL", "PLUMB", "FIRE", "GEN"].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <input
              id="makeCurrent"
              type="checkbox"
              className="h-4 w-4"
              checked={makeCurrent}
              onChange={(e) => setMakeCurrent(e.target.checked)}
            />
            <label htmlFor="makeCurrent" className="text-sm text-slate-700">
              Set this upload as <b>Current</b> (else Pending Review)
            </label>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">PDF</label>
          <input
            type="file"
            accept="application/pdf"
            className="mt-1 block w-full text-sm"
            onChange={(e) => setPdf(e.target.files?.[0] || null)}
          />
        </div>

        <button
          onClick={upload}
          disabled={saving || !pdf}
          className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Uploading..." : "Upload PDF"}
        </button>
      </div>
    </div>
  );
}