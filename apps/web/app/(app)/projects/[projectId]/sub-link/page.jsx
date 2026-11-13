"use client";
import { useState } from "react";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function SubLinkPage() {
  const params = useParams();
  const projectId = params?.projectId;
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${API_URL}/projects/${projectId}/sub-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ days: 7 }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      setLink(`${window.location.origin}${data.url}`);
    } catch (e) {
      setError(e.message || "Failed");
    }
    setLoading(false);
  }

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Sub Portal Link</h1>
      <p className="text-sm text-slate-500">Create a 7-day link for a sub to upload quotes, submittals, or docs.</p>
      <button onClick={create} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
        {loading ? "Creating…" : "Create Link"}
      </button>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {link && (
        <div className="border rounded p-3 text-sm break-all bg-slate-50">
          <div className="font-medium mb-1">Share this link:</div>
          {link}
        </div>
      )}
    </div>
  );
}
