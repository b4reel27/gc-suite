"use client";
import { useState, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || "";
}

export default function AIInsightsCard({ projectId }) {
  const [summary, setSummary] = useState("");
  const [rfiDraft, setRfiDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function fetchRealEntries() {
    if (!projectId) return [];
    try {
      const token = getToken();
      const headers = { Authorization: token ? `Bearer ${token}` : "" };
      const [logsRes, issuesRes] = await Promise.all([
        fetch(`${API_URL}/projects/${projectId}/daily-logs`, { headers }),
        fetch(`${API_URL}/projects/${projectId}/punch`, { headers }),
      ]);
      const logs = logsRes.ok ? await logsRes.json() : [];
      const issues = issuesRes.ok ? await issuesRes.json() : [];
      const entries = [
        ...(Array.isArray(logs) ? logs : []).slice(0, 10).map(l => ({ note: l.notes || l.note || l.title || JSON.stringify(l).slice(0, 200) })),
        ...(Array.isArray(issues) ? issues : []).slice(0, 10).map(i => ({ note: `Issue: ${i.title || ""} ${i.description || ""} (${i.status || ""})` })),
      ];
      return entries.length ? entries : [{ note: "No recent daily logs or issues found." }];
    } catch {
      return [{ note: "Could not load project data." }];
    }
  }

  async function generateSummary() {
    setLoading(true);
    setStatus("Loading real project data…");
    try {
      const entries = await fetchRealEntries();
      setStatus("Summarizing…");
      const token = getToken();
      const r = await fetch(`${API_URL}/ai/summarize-daily`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ entries }),
      });
      const data = await r.json();
      setSummary(data.summary || data.error || "No summary");
      setStatus("");
    } catch (e) {
      setSummary("AI unavailable");
      setStatus("");
    }
    setLoading(false);
  }

  async function draftRFI() {
    setLoading(true);
    setStatus("Loading open issues…");
    try {
      const entries = await fetchRealEntries();
      const context = entries.map(e => e.note).join("\n").slice(0, 1500);
      setStatus("Drafting RFI…");
      const token = getToken();
      const r = await fetch(`${API_URL}/ai/draft-rfi`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ context }),
      });
      const data = await r.json();
      setRfiDraft(data.draft || data.error || "No draft");
      setStatus("");
    } catch (e) {
      setRfiDraft("AI unavailable");
      setStatus("");
    }
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-lg border p-4 shadow-sm">
      <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">✨ AI Assistant</h3>
      <div className="flex gap-2 mb-3 flex-wrap">
        <button onClick={generateSummary} disabled={loading || !projectId} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50">
          {loading ? "Working…" : "Summarize Daily Log"}
        </button>
        <button onClick={draftRFI} disabled={loading || !projectId} className="text-xs px-3 py-1.5 bg-gray-800 text-white rounded disabled:opacity-50">
          Draft RFI from Issues
        </button>
      </div>
      {status && <p className="text-xs text-slate-500 mb-2">{status}</p>}
      {summary && <pre className="text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap mb-2 max-h-48 overflow-auto">{summary}</pre>}
      {rfiDraft && <pre className="text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap max-h-48 overflow-auto">{rfiDraft}</pre>}
      {!projectId && <p className="text-xs text-amber-600">Select a project to use AI features.</p>}
    </div>
  );
}
