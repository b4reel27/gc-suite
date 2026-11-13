"use client";
import { useState } from "react";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function BidDeadlinesPage() {
  const params = useParams();
  const projectId = params?.projectId;
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [deadlines, setDeadlines] = useState([]);
  const [error, setError] = useState("");

  async function extract() {
    if (!text.trim()) { setError("Paste ITB or Div 00/01 text first."); return; }
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${API_URL}/projects/${projectId}/bid-deadlines`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      setDeadlines(data.deadlines || []);
    } catch (e) {
      setError(e.message || "Extraction failed");
    }
    setLoading(false);
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Bid Deadlines</h1>
      <p className="text-sm text-slate-500">Paste the ITB, general conditions, or Division 00/01. AI will extract pre-bid deadlines.</p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={10}
        className="w-full border rounded px-3 py-2 text-sm font-mono"
        placeholder="Paste ITB text here..."
      />
      <button onClick={extract} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
        {loading ? "Extracting…" : "Extract Deadlines"}
      </button>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {deadlines.length > 0 && (
        <div className="border rounded p-3 space-y-2">
          {deadlines.map((d, i) => (
            <div key={i} className="text-sm border-b pb-2">
              <div className="font-medium">{d.title}</div>
              <div className="text-xs text-slate-500">
                {d.due_date || "No date"} {d.due_time ? `· ${d.due_time}` : ""} · {d.owner || "GC"}
              </div>
              {d.notes && <div className="text-xs text-slate-600 mt-0.5">{d.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
