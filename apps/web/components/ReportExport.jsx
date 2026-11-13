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
        `${n + 1}. [${i.status || "?"}] ${i.title || "Untitled"} — ${i.location || ""} ${i.description || ""}`.trim()
      );
      const text = `Work to Complete Report\nProject: ${projectId}\nGenerated: ${new Date().toLocaleString()}\n\n${lines.join("\n") || "No issues."}`;
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `issues-${projectId}-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed");
    }
    setBusy(false);
  }

  return (
    <button
      onClick={exportIssues}
      disabled={busy || !projectId}
      className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded disabled:opacity-50"
    >
      {busy ? "Exporting…" : "Export Issues"}
    </button>
  );
}
