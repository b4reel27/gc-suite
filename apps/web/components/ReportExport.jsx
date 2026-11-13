"use client";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function ReportExport({ projectId }) {
  const [busy, setBusy] = useState(false);

  async function exportIssues() {
    if (!projectId) return;
    setBusy(true);
    try {
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${API_URL}/projects/${projectId}/punch`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      const issues = r.ok ? await r.json() : [];
      const lines = (Array.isArray(issues) ? issues : []).map((i, n) =>
        `${n + 1}. [${i.status || "?"}] ${i.title || "Untitled"}\n   Location: ${i.location || "—"}\n   Trade: ${i.trade || "—"}\n   ${i.description || ""}`.trim()
      );
      const text = `WORK TO COMPLETE REPORT\nProject: ${projectId}\nGenerated: ${new Date().toLocaleString()}\n\n${lines.join("\n\n") || "No issues."}\n\n— End of report —`;
      downloadText(text, `issues-${projectId}.txt`);
    } catch {
      alert("Export failed");
    }
    setBusy(false);
  }

  async function exportDaily() {
    if (!projectId) return;
    setBusy(true);
    try {
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${API_URL}/projects/${projectId}/daily-logs`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      const logs = r.ok ? await r.json() : [];
      const lines = (Array.isArray(logs) ? logs : []).slice(0, 20).map((l, n) =>
        `${n + 1}. ${l.date || l.created_at || ""}\n   ${l.notes || l.note || l.title || JSON.stringify(l).slice(0, 200)}`
      );
      const text = `DAILY LOG REPORT\nProject: ${projectId}\nGenerated: ${new Date().toLocaleString()}\n\n${lines.join("\n\n") || "No logs."}`;
      downloadText(text, `daily-log-${projectId}.txt`);
    } catch {
      alert("Export failed");
    }
    setBusy(false);
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex gap-2 flex-wrap">
      <button onClick={exportIssues} disabled={busy || !projectId} className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded disabled:opacity-50">
        {busy ? "Exporting…" : "Export Issues"}
      </button>
      <button onClick={exportDaily} disabled={busy || !projectId} className="text-xs px-3 py-1.5 bg-slate-700 text-white rounded disabled:opacity-50">
        Export Daily Log
      </button>
    </div>
  );
}
