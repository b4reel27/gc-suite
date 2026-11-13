"use client";
import { useState, useEffect } from "react";

type Pin = { id: string; x: number; y: number; note: string; color: string; issueId?: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function PlanViewer({ sheetUrl, projectId }: { sheetUrl?: string; projectId?: string }) {
  const [pins, setPins] = useState<Pin[]>([]);
  const [tool, setTool] = useState<"pin" | "none">("pin");
  const [color, setColor] = useState("#ef4444");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const key = `pins-${projectId || "default"}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try { setPins(JSON.parse(saved)); } catch {}
    }
  }, [projectId]);

  const saveLocal = (next: Pin[]) => {
    setPins(next);
    localStorage.setItem(`pins-${projectId || "default"}`, JSON.stringify(next));
  };

  async function trySavePinToBackend(pin: Pin) {
    if (!projectId || !pin.issueId) return;
    try {
      const token = localStorage.getItem("token") || "";
      await fetch(`${API_URL}/punch/${pin.issueId}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ x: pin.x, y: pin.y, sheet_id: sheetUrl }),
      });
    } catch {}
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== "pin") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const note = prompt("Pin note:") || "Issue";
    const pin: Pin = { id: Date.now().toString(), x, y, note, color };
    const next = [...pins, pin];
    saveLocal(next);
    setStatus("Pin saved locally. Create an issue from it to sync to the server.");
    setTimeout(() => setStatus(""), 3000);
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
        <button
          onClick={() => setTool(tool === "pin" ? "none" : "pin")}
          className={`px-3 py-1 rounded ${tool === "pin" ? "bg-red-500 text-white" : "bg-white border"}`}
        >
          📍 Drop Pin
        </button>
        <div className="flex gap-1">
          {["#ef4444", "#f59e0b", "#10b981", "#3b82f6"].map(c => (
            <button key={c} onClick={() => setColor(c)} className="w-6 h-6 rounded-full border-2" style={{ background: c, borderColor: color === c ? "#000" : "transparent" }} />
          ))}
        </div>
        <button onClick={exportPins} className="ml-auto text-xs px-2 py-1 bg-white border rounded">Export Pins</button>
        <span className="text-xs text-gray-500">{pins.length} pins</span>
      </div>
      <div
        className="relative w-full h-[65vh] cursor-crosshair bg-contain bg-center bg-no-repeat bg-gray-100"
        style={{ backgroundImage: sheetUrl ? `url(${sheetUrl})` : undefined }}
        onClick={handleClick}
      >
        {pins.map((p, i) => (
          <div
            key={p.id}
            className="absolute w-7 h-7 rounded-full border-2 border-white shadow flex items-center justify-center text-white text-xs font-bold -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x}%`, top: `${p.y}%`, background: p.color }}
            title={p.note}
          >
            {i + 1}
          </div>
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
