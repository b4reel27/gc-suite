"use client";
import { useState, useRef } from "react";

export default function PlanViewer({ sheetUrl }: { sheetUrl?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pins, setPins] = useState<{x:number;y:number;note:string}[]>([]);
  const [drawing, setDrawing] = useState(false);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const note = prompt("Pin note:") || "Pin";
    setPins(prev => [...prev, { x, y, note }]);
  };

  return (
    <div className="relative w-full h-[70vh] bg-gray-100 border rounded">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onClick={handleCanvasClick}
        style={{ backgroundImage: sheetUrl ? `url(${sheetUrl})` : undefined, backgroundSize: "contain", backgroundRepeat: "no-repeat" }}
      />
      {pins.map((p, i) => (
        <div
          key={i}
          className="absolute w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs -translate-x-1/2 -translate-y-1/2"
          style={{ left: p.x, top: p.y }}
          title={p.note}
        >
          {i + 1}
        </div>
      ))}
      <div className="absolute bottom-2 left-2 bg-white/90 px-2 py-1 text-xs rounded">
        Click to drop pin • {pins.length} pins
      </div>
    </div>
  );
}
