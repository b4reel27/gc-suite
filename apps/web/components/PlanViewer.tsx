"use client";
import { useState, useRef, useEffect } from "react";

type Pin = { id: string; x: number; y: number; note: string; color: string };

export default function PlanViewer({ sheetUrl, projectId }: { sheetUrl?: string; projectId?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [tool, setTool] = useState<"pin" | "none">("pin");
  const [color, setColor] = useState("#ef4444");

  useEffect(() => {
    // Load saved pins if any (local for now)
    const key = `pins-${projectId || "default"}`;
    const saved = localStorage.getItem(key);
    if (saved) setPins(JSON.parse(saved));
  }, [projectId]);

  const savePins = (next: Pin[]) => {
    setPins(next);
    localStorage.setItem(`pins-${projectId || "default"}`, JSON.stringify(next));
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== "pin") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const note = prompt("Pin note (e.g. Door needs adjustment):") || "Issue";
    savePins([...pins, { id: Date.now().toString(), x, y, note, color }]);
  };

  return (
    <div className="relative w-full bg-white border rounded-lg overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 p-2 border-b bg-gray-50 text-sm">
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
        <span className="ml-auto text-xs text-gray-500">{pins.length} pins</span>
      </div>
      <div
        className="relative w-full h-[65vh] cursor-crosshair bg-contain bg-center bg-no-repeat bg-gray-100"
        style={{ backgroundImage: sheetUrl ? `url(${sheetUrl})` : undefined }}
        onClick={handleClick}
      >
        {pins.map(p => (
          <div
            key={p.id}
            className="absolute w-7 h-7 rounded-full border-2 border-white shadow flex items-center justify-center text-white text-xs font-bold -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x}%`, top: `${p.y}%`, background: p.color }}
            title={p.note}
          >
            {pins.indexOf(p) + 1}
          </div>
        ))}
      </div>
      {pins.length > 0 && (
        <div className="p-2 border-t max-h-32 overflow-auto text-xs">
          {pins.map((p, i) => (
            <div key={p.id} className="flex justify-between py-1">
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: p.color }} />{i + 1}. {p.note}</span>
              <button onClick={() => savePins(pins.filter(x => x.id !== p.id))} className="text-red-500">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
