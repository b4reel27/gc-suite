"use client";

import { useEffect, useRef, useState } from "react";

/*
 * PhotoMarkup — lets the user draw circles, arrows, and text labels on a photo
 * before uploading/attaching it.
 *
 * Props:
 *   src        — image URL or data URL
 *   onDone(blob) — called with the annotated image as a Blob
 *   onCancel()   — called when the user discards markup
 */
export default function PhotoMarkup({ src, onDone, onCancel }) {
  const canvasRef = useRef(null);
  const [tool, setTool]         = useState("circle");  // "circle" | "arrow" | "text"
  const [color, setColor]       = useState("#ef4444");
  const [drawing, setDrawing]   = useState(false);
  const [startPt, setStartPt]   = useState(null);
  const [shapes, setShapes]     = useState([]);
  const [pendingText, setPending] = useState(null); // {x, y}
  const [textInput, setTextInput] = useState("");
  const imgRef = useRef(null);

  const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#ffffff", "#0f172a"];

  // Draw everything on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw base image
    const img = imgRef.current;
    if (!img || !img.complete) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw all committed shapes
    shapes.forEach((s) => drawShape(ctx, s));
  }, [shapes]);

  function drawShape(ctx, s) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle   = s.color;
    ctx.lineWidth   = 3;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";

    if (s.type === "circle") {
      const rx = Math.abs(s.x2 - s.x1) / 2;
      const ry = Math.abs(s.y2 - s.y1) / 2;
      const cx = (s.x1 + s.x2) / 2;
      const cy = (s.y1 + s.y2) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 4), Math.max(ry, 4), 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (s.type === "arrow") {
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const angle = Math.atan2(dy, dx);
      const head = 14;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      // arrowhead
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(s.x2 - head * Math.cos(angle - Math.PI / 6), s.y2 - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(s.x2 - head * Math.cos(angle + Math.PI / 6), s.y2 - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }

    if (s.type === "text") {
      ctx.font = "bold 16px system-ui, sans-serif";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 4;
      ctx.fillText(s.text, s.x, s.y);
      ctx.shadowBlur = 0;
    }
  }

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top)  * scaleY,
    };
  }

  function onMouseDown(e) {
    e.preventDefault();
    if (tool === "text") {
      const pos = getPos(e);
      setPending(pos);
      setTextInput("");
      return;
    }
    setDrawing(true);
    setStartPt(getPos(e));
  }

  function onMouseMove(e) {
    e.preventDefault();
    if (!drawing || !startPt) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const pos    = getPos(e);

    // Redraw base + committed shapes
    const img = imgRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (img && img.complete) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    shapes.forEach((s) => drawShape(ctx, s));

    // Preview current shape
    drawShape(ctx, { type: tool, color, x1: startPt.x, y1: startPt.y, x2: pos.x, y2: pos.y });
  }

  function onMouseUp(e) {
    e.preventDefault();
    if (!drawing || !startPt) return;
    const pos = getPos(e);
    setShapes((prev) => [...prev, { type: tool, color, x1: startPt.x, y1: startPt.y, x2: pos.x, y2: pos.y }]);
    setDrawing(false);
    setStartPt(null);
  }

  function commitText() {
    if (!pendingText || !textInput.trim()) { setPending(null); return; }
    setShapes((prev) => [...prev, { type: "text", color, x: pendingText.x, y: pendingText.y, text: textInput.trim() }]);
    setPending(null);
    setTextInput("");
  }

  function undo() {
    setShapes((prev) => prev.slice(0, -1));
  }

  function handleDone() {
    canvasRef.current.toBlob((blob) => onDone(blob), "image/jpeg", 0.92);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Hidden image used as source */}
      <img ref={imgRef} src={src} alt="" crossOrigin="anonymous" className="hidden"
        onLoad={() => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const img = imgRef.current;
          canvas.width  = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
        }}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Tools */}
        {[
          { id: "circle", label: "Circle" },
          { id: "arrow",  label: "Arrow" },
          { id: "text",   label: "Text" },
        ].map((t) => (
          <button key={t.id} type="button" onClick={() => setTool(t.id)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              tool === t.id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700"
            }`}>
            {t.label}
          </button>
        ))}

        <div className="mx-1 h-5 border-l border-slate-200" />

        {/* Colors */}
        {COLORS.map((c) => (
          <button key={c} type="button" onClick={() => setColor(c)}
            className={`h-7 w-7 rounded-full border-2 transition ${
              color === c ? "border-slate-900 scale-110" : "border-slate-200"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}

        <div className="mx-1 h-5 border-l border-slate-200" />

        <button type="button" onClick={undo} disabled={shapes.length === 0}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40">
          Undo
        </button>
      </div>

      {/* Canvas */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-black">
        <canvas ref={canvasRef}
          className="w-full touch-none"
          style={{ cursor: tool === "text" ? "text" : "crosshair", maxHeight: "60vh", objectFit: "contain" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onTouchStart={onMouseDown}
          onTouchMove={onMouseMove}
          onTouchEnd={onMouseUp}
        />

        {/* Text input overlay */}
        {pendingText && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="rounded-2xl bg-white p-4 shadow-xl">
              <div className="mb-2 text-sm font-semibold text-slate-900">Add Label</div>
              <input autoFocus type="text" value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setPending(null); }}
                placeholder="Type label…"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-600" />
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={commitText}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Add</button>
                <button type="button" onClick={() => setPending(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button type="button" onClick={handleDone}
          className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
          Use Annotated Photo
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Skip Markup
        </button>
      </div>
    </div>
  );
}
