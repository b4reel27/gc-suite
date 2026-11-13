"use client";
import { useState } from "react";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function VoiceDailyPage() {
  const params = useParams();
  const projectId = params?.projectId;
  const [text, setText] = useState("");
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function draftLog() {
    if (!text.trim()) { setError("Enter a note first."); return; }
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${API_URL}/projects/${projectId}/daily-log/from-voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      setDraft(data.draft);
    } catch (e) {
      setError(e.message || "Failed");
    }
    setLoading(false);
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Voice Daily Log</h1>
      <p className="text-sm text-slate-500">Type or paste a quick note. AI drafts the daily log.</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={5} className="w-full border rounded px-3 py-2 text-sm" placeholder="Framed east wall, 4 carpenters, lumber delivered, rain delay AM..." />
      <button onClick={draftLog} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
        {loading ? "Drafting…" : "Draft Log"}
      </button>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {draft && (
        <div className="border rounded p-3 text-sm space-y-1 bg-slate-50">
          <div><strong>Work:</strong> {draft.work_done}</div>
          <div><strong>Manpower:</strong> {(draft.manpower || []).map(m => `${m.trade} ${m.count}`).join(", ") || "—"}</div>
          <div><strong>Deliveries:</strong> {(draft.deliveries || []).join(", ") || "—"}</div>
          <div><strong>Delays:</strong> {(draft.delays || []).join(", ") || "—"}</div>
          <div><strong>Safety:</strong> {draft.safety || "—"}</div>
        </div>
      )}
    </div>
  );
}
