"use client";
import { useState } from "react";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function WeeklyReportPage() {
  const params = useParams();
  const projectId = params?.projectId;
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${API_URL}/projects/${projectId}/weekly-report`, {
        method: "POST",
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      setDraft(data.draft || "");
    } catch (e) {
      setError(e.message || "Failed");
    }
    setLoading(false);
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Weekly Report</h1>
      <p className="text-sm text-slate-500">Draft only — review before sending.</p>
      <button onClick={generate} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
        {loading ? "Drafting…" : "Generate Draft"}
      </button>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {draft && (
        <div className="border rounded p-3 text-sm whitespace-pre-wrap bg-slate-50">{draft}</div>
      )}
    </div>
  );
}
