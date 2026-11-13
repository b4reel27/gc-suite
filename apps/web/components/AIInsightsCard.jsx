"use client";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function AIInsightsCard({ projectId }) {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [rfiDraft, setRfiDraft] = useState("");

  async function generateSummary() {
    setLoading(true);
    try {
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${API_URL}/ai/summarize-daily`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ entries: [{ note: "Sample field notes for demo — wire real daily logs here" }] }),
      });
      const data = await r.json();
      setSummary(data.summary || data.error || "No summary");
    } catch (e) {
      setSummary("AI unavailable");
    }
    setLoading(false);
  }

  async function draftRFI() {
    setLoading(true);
    try {
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${API_URL}/ai/draft-rfi`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ context: "Door hardware at north entry is binding and needs adjustment" }),
      });
      const data = await r.json();
      setRfiDraft(data.draft || data.error || "No draft");
    } catch (e) {
      setRfiDraft("AI unavailable");
    }
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-lg border p-4 shadow-sm">
      <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">✨ AI Assistant (free-tier Gemini)</h3>
      <div className="flex gap-2 mb-3">
        <button onClick={generateSummary} disabled={loading} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50">
          {loading ? "Working..." : "Summarize Daily Log"}
        </button>
        <button onClick={draftRFI} disabled={loading} className="text-xs px-3 py-1.5 bg-gray-800 text-white rounded disabled:opacity-50">
          Draft RFI
        </button>
      </div>
      {summary && <pre className="text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap mb-2">{summary}</pre>}
      {rfiDraft && <pre className="text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap">{rfiDraft}</pre>}
      <p className="text-[10px] text-gray-400 mt-2">Rate-limited queue keeps free-tier Gemini happy. Wire real project data next.</p>
    </div>
  );
}
