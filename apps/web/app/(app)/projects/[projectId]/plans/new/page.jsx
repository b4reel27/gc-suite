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
    <div className="space-y-5">
      <div>
        <Link
          href={`/projects/${projectId}/plans`}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back to Plans
        </Link>

        <h1 className="mt-3 text-2xl font-bold text-slate-900">Add Sheet</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload a PDF — we’ll log the sheet + revision automatically.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-600">Sheet No</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              value={sheetNo}
              onChange={(e) => setSheetNo(e.target.value)}
              placeholder="A1.01"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600">
              Sheet ID <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              placeholder="A101"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600">Title</label>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Floor Plan"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-600">Discipline</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
            >
              {["ARCH", "STRUCT", "ELEC", "MECH", "CIVIL", "PLUMB", "FIRE", "GEN"].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pt-5">
            <input
              id="makeCurrent"
              type="checkbox"
              className="h-4 w-4 rounded"
              checked={makeCurrent}
              onChange={(e) => setMakeCurrent(e.target.checked)}
            />
            <label htmlFor="makeCurrent" className="text-sm text-slate-700">
              Mark as <span className="font-semibold">Current</span> revision
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600">PDF File</label>
          <input
            type="file"
            accept="application/pdf"
            className="mt-1 block w-full text-sm text-slate-700"
            onChange={(e) => setPdf(e.target.files?.[0] || null)}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={upload}
            disabled={saving || !pdf}
            className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Uploading…" : "Upload PDF"}
          </button>
          <Link
            href={`/projects/${projectId}/plans`}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}