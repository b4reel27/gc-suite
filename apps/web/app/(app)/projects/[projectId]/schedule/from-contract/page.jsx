"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function ScheduleFromContractPage() {
  const params = useParams();
  const projectId = params?.projectId;
  const router = useRouter();
  const [contractText, setContractText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      const text = await file.text();
      setContractText(text);
    } else {
      setError("For now paste text or upload a .txt file. PDF text extraction coming soon.");
    }
  }

  async function generate() {
    if (!contractText.trim() || !startDate) {
      setError("Contract text and start date are required.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${API_URL}/projects/${projectId}/schedule/from-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ contractText, startDate, projectName }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Generation failed");
      setResult(data);
    } catch (e) {
      setError(e.message || "Failed");
    }
    setLoading(false);
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Build Schedule from Contract</h1>
      <p className="text-sm text-slate-500">Paste the contract (or key scope sections) and set a start date. AI will create a preliminary schedule.</p>

      <div>
        <label className="block text-sm font-medium mb-1">Project name (optional)</label>
        <input value={projectName} onChange={e => setProjectName(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" placeholder="Big Jake's" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Start date</label>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Contract text</label>
        <textarea
          value={contractText}
          onChange={e => setContractText(e.target.value)}
          rows={10}
          className="w-full border rounded px-3 py-2 text-sm font-mono"
          placeholder="Paste scope of work, key milestones, or full contract text here..."
        />
        <input type="file" accept=".txt,text/plain" onChange={handleFile} className="mt-1 text-xs" />
      </div>

      <button
        onClick={generate}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
      >
        {loading ? "Generating schedule…" : "Generate Preliminary Schedule"}
      </button>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {result && (
        <div className="border rounded p-3 bg-slate-50">
          <div className="text-sm font-medium mb-2">Generated {result.generated} tasks · Saved {result.saved}</div>
          <ul className="text-xs space-y-1 max-h-64 overflow-auto">
            {(result.items || []).map((item, i) => (
              <li key={i}>
                <span className="font-medium">{item.title}</span>
                <span className="text-slate-500"> · {item.trade} · {item.duration_days}d (offset {item.start_offset_days}d)</span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => router.push(`/projects/${projectId}/schedule`)}
            className="mt-3 text-xs px-3 py-1.5 bg-slate-800 text-white rounded"
          >
            View Schedule
          </button>
        </div>
      )}
    </div>
  );
}
