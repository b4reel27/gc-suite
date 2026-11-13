"use client";
import { useState, useEffect } from "react";

type Pin = { id: string; x: number; y: number; note: string; color: string; issueId?: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function PlanViewer({ sheetUrl, projectId, sheetId }: { sheetUrl?: string; projectId?: string; sheetId?: string }) {
  const [pins, setPins] = useState<Pin[]>([]);
  const [tool, setTool] = useState<"pin" | "none">("pin");
  const [color, setColor] = useState("#ef4444");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const key = `pins-${projectId || "default"}-${sheetId || "s"}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try { setPins(JSON.parse(saved)); } catch {}
    }
  }, [projectId, sheetId]);

  const saveLocal = (next: Pin[]) => {
    setPins(next);
    localStorage.setItem(`pins-${projectId || "default"}-${sheetId || "s"}`, JSON.stringify(next));
  };

  async function createIssueFromPin(pin: Pin) {
    if (!projectId) return null;
    try {
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${API_URL}/projects/${projectId}/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({
          title: pin.note.slice(0, 120),
          description: pin.note,
          location: `Plan pin ${pin.x.toFixed(1)}%, ${pin.y.toFixed(1)}%`,
          status: "OPEN",
        }),
      });
      if (!r.ok) return null;
      const data = await r.json();
      return data.id || data.issue?.id;
    } catch {
      return null;
    }
  }

  async function savePinToBackend(issueId: string, pin: Pin) {
    try {
      const token = localStorage.getItem("token") || "";
      await fetch(`${API_URL}/punch/${issueId}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ x: pin.x, y: pin.y, sheet_id: sheetId || sheetUrl }),
      });
    } catch {}
  }

  const handleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== "pin") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const note = prompt("Pin note (creates an issue):") || "Issue";
    const pin: Pin = { id: Date.now().toString(), x, y, note, color };
    setStatus("Saving pin…");
    const issueId = await createIssueFromPin(pin);
    if (issueId) {
      pin.issueId = issueId;
      await savePinToBackend(issueId, pin);
      setStatus("Pin saved and linked to issue.");
    } else {
      setStatus("Saved locally (backend unavailable).");
    }
    saveLocal([...pins, pin]);
    setTimeout(() => setStatus(""), 2500);
  };

  function exportPins() {
    const text = pins.map((p, i) => `${i + 1}. ${p.note} (${p.x.toFixed(1)}%, ${p.y.toFixed(1)}%)`).join("\n");
    const blob = new Blob([`Plan Pins\n${new Date().toLocaleString()}\n\n${text}`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plan-pins-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="relative w-full bg-white border rounded-lg overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 p-2 border-b bg-gray-50 text-sm flex-wrap">
        <button onClick={() => setTool(tool === "pin" ? "none" : "pin")} className={`px-3 py-1 rounded ${tool === "pin" ? "bg-red-500 text-white" : "bg-white border"}`}>📍 Drop Pin</button>
        <div className="flex gap-1">
          {["#ef4444", "#f59e0b", "#10b981", "#3b82f6"].map(c => (
            <button key={c} onClick={() => setColor(c)} className="w-6 h-6 rounded-full border-2" style={{ background: c, borderColor: color === c ? "#000" : "transparent" }} />
          ))}
        </div>
        <button onClick={exportPins} className="ml-auto text-xs px-2 py-1 bg-white border rounded">Export</button>
        <span className="text-xs text-gray-500">{pins.length} pins</span>
      </div>
      <div className="relative w-full h-[65vh] cursor-crosshair bg-contain bg-center bg-no-repeat bg-gray-100" style={{ backgroundImage: sheetUrl ? `url(${sheetUrl})` : undefined }} onClick={handleClick}>
        {pins.map((p, i) => (
          <div key={p.id} className="absolute w-7 h-7 rounded-full border-2 border-white shadow flex items-center justify-center text-white text-xs font-bold -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%`, background: p.color }} title={p.note}>{i + 1}</div>
        ))}
      </div>
      {status && <div className="px-2 py-1 text-xs bg-blue-50 text-blue-700">{status}</div>}
      {pins.length > 0 && (
        <div className="p-2 border-t max-h-32 overflow-auto text-xs">
          {pins.map((p, i) => (
            <div key={p.id} className="flex justify-between py-1">
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: p.color }} />{i + 1}. {p.note}</span>
              <button onClick={() => saveLocal(pins.filter(x => x.id !== p.id))} className="text-red-500">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
