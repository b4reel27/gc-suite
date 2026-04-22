"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtDate } from "../_data";

/* ── Plan Markup Canvas ───────────────────────────────────────────────────── */

const MARKUP_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#000000"];

function PlanMarkupCanvas({ containerRef, existingUrl, onSave, onCancel }) {
  const canvasRef   = useRef(null);
  const [tool, setTool]   = useState("circle");
  const [color, setColor] = useState("#ef4444");
  const [shapes, setShapes] = useState([]);
  const [drawing, setDrawing] = useState(null);
  const [textPos, setTextPos] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    canvas.width  = rect.width;
    canvas.height = rect.height;
    if (existingUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = existingUrl;
    }
  }, [existingUrl]);

  function redraw(shapeList) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of shapeList) drawShape(ctx, s);
  }

  function drawShape(ctx, s) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle   = s.color;
    ctx.lineWidth   = 2.5;
    if (s.type === "circle") {
      ctx.beginPath();
      const rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
      ctx.ellipse(s.x1 + (s.x2 - s.x1) / 2, s.y1 + (s.y2 - s.y1) / 2, Math.max(rx, 4), Math.max(ry, 4), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.type === "arrow") {
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const head  = 14;
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(s.x2 - head * Math.cos(angle - 0.4), s.y2 - head * Math.sin(angle - 0.4));
      ctx.lineTo(s.x2 - head * Math.cos(angle + 0.4), s.y2 - head * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
    } else if (s.type === "text") {
      ctx.font = "bold 15px system-ui, Arial";
      ctx.fillText(s.text, s.x1, s.y1);
    }
  }

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function onDown(e) {
    if (tool === "text") { setTextPos(getPos(e)); return; }
    const p = getPos(e);
    setDrawing({ type: tool, color, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  }

  function onMove(e) {
    if (!drawing) return;
    const p = getPos(e);
    const current = { ...drawing, x2: p.x, y2: p.y };
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    shapes.forEach((s) => drawShape(ctx, s));
    drawShape(ctx, current);
  }

  function onUp(e) {
    if (!drawing) return;
    const p = getPos(e);
    const finished = { ...drawing, x2: p.x, y2: p.y };
    const next = [...shapes, finished];
    setShapes(next);
    setDrawing(null);
    redraw(next);
  }

  function undo() {
    const next = shapes.slice(0, -1);
    setShapes(next);
    redraw(next);
  }

  function handleTextSubmit(text) {
    if (!text || !textPos) { setTextPos(null); return; }
    const s = { type: "text", color, text, x1: textPos.x, y1: textPos.y };
    const next = [...shapes, s];
    setShapes(next);
    setTextPos(null);
    redraw(next);
  }

  function handleSave() {
    canvasRef.current.toBlob((blob) => blob && onSave(blob), "image/png");
  }

  const toolBtn = (t, label) => (
    <button type="button" onClick={() => setTool(t)}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${tool === t ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
      {label}
    </button>
  );

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-black/5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 bg-white/95 px-3 py-2 shadow-md">
        {toolBtn("circle", "◯ Circle")}
        {toolBtn("arrow",  "→ Arrow")}
        {toolBtn("text",   "T Text")}
        <div className="flex gap-1.5 ml-1">
          {MARKUP_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              style={{ backgroundColor: c }}
              className={`h-5 w-5 rounded-full border-2 ${color === c ? "border-slate-900 scale-125" : "border-transparent"}`} />
          ))}
        </div>
        <button type="button" onClick={undo} disabled={shapes.length === 0}
          className="ml-auto rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40 hover:bg-slate-50">
          Undo
        </button>
        <button type="button" onClick={handleSave}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
          Save Markup
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
      </div>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="flex-1 touch-none cursor-crosshair"
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
      />
      {/* Text input dialog */}
      {textPos && (
        <div className="absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <p className="mb-2 text-sm font-semibold text-slate-700">Enter annotation text</p>
          <input autoFocus className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
            onKeyDown={(e) => { if (e.key === "Enter") handleTextSubmit(e.target.value); if (e.key === "Escape") setTextPos(null); }} />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setTextPos(null)} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
            <button type="button" onClick={(e) => handleTextSubmit(e.target.closest("div").previousSibling.value)}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

const API_URL =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : "";

function getToken() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem("token") || "";
}

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const d = await res.json();
      msg = d?.error || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

const STATUS_COLORS = {
  OPEN:        "#ef4444",
  IN_PROGRESS: "#f59e0b",
  RESOLVED:    "#10b981",
  CLOSED:      "#6b7280",
};

function PinDot({ pin, onClick }) {
  const color = STATUS_COLORS[pin.status] || "#ef4444";
  return (
    <button
      type="button"
      onClick={onClick}
      title={pin.title}
      style={{
        position: "absolute",
        left: `${pin.pin_x}%`,
        top:  `${pin.pin_y}%`,
        transform: "translate(-50%, -50%)",
        width: 28,
        height: 28,
        borderRadius: "50%",
        backgroundColor: color,
        border: "2.5px solid white",
        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
        transition: "transform 0.1s",
      }}
    >
      <span style={{ color: "white", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>!</span>
    </button>
  );
}

function PinDetailPopup({ pin, onClose }) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${Math.min(pin.pin_x, 70)}%`,
        top:  `${Math.min(pin.pin_y + 5, 80)}%`,
        zIndex: 20,
        minWidth: 220,
        background: "white",
        borderRadius: 16,
        border: "1px solid #e2e8f0",
        boxShadow: "0 8px 32px rgba(15,23,42,0.18)",
        padding: "14px 16px",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-slate-900">{pin.title || "Issue"}</div>
          {pin.trade && (
            <div className="mt-0.5 text-xs text-slate-500">{pin.trade}</div>
          )}
        </div>
        <button onClick={onClose} className="flex-shrink-0 text-slate-400 hover:text-slate-700">
          ✕
        </button>
      </div>
      {pin.location && (
        <div className="mt-1.5 text-xs text-slate-600">{pin.location}</div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{
            backgroundColor: `${STATUS_COLORS[pin.status] || "#6b7280"}22`,
            color: STATUS_COLORS[pin.status] || "#6b7280",
          }}
        >
          {pin.status || "OPEN"}
        </span>
        {pin.priority && (
          <span className="text-xs text-slate-500">{pin.priority}</span>
        )}
      </div>
    </div>
  );
}

function PlaceForm({ x, y, projectId, sheetId, onPlaced, onCancel }) {
  const [issues, setIssues]   = useState([]);
  const [issueId, setIssueId] = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    apiFetch(`/projects/${projectId}/punch`)
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.issues || [];
        setIssues(list.filter((i) => !i.pin_x)); // only unpinned
      })
      .catch(() => {});
  }, [projectId]);

  async function handlePin() {
    if (!issueId) { setError("Select an issue"); return; }
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/punch/${issueId}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_sheet_id: sheetId, pin_x: x, pin_y: y }),
      });
      onPlaced();
    } catch (e) {
      setError(e?.message || "Failed to pin");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        left: `${Math.min(x, 60)}%`,
        top:  `${Math.min(y + 3, 78)}%`,
        zIndex: 30,
        minWidth: 240,
        background: "white",
        borderRadius: 16,
        border: "1px solid #e2e8f0",
        boxShadow: "0 8px 32px rgba(15,23,42,0.22)",
        padding: "14px 16px",
      }}
    >
      <div className="mb-2 text-sm font-bold text-slate-900">Pin Issue Here</div>
      {error && <div className="mb-2 text-xs text-red-600">{error}</div>}
      <select
        value={issueId}
        onChange={(e) => setIssueId(e.target.value)}
        className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
      >
        <option value="">— choose an issue —</option>
        {issues.map((i) => (
          <option key={i.id} value={i.id}>
            #{i.id.slice(0, 6)} · {i.title}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          onClick={handlePin}
          disabled={saving}
          className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Pinning…" : "Pin"}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function PlanViewerClient({ projectId, sheetId, plan }) {
  const defaultRev =
    plan?.revisions.find((r) => r.status === "Current")?.rev ||
    plan?.revisions[0]?.rev ||
    "";

  const [selectedRev, setSelectedRev]   = useState(defaultRev);
  const [pinMode, setPinMode]           = useState(false);
  const [pins, setPins]                 = useState([]);
  const [pendingPin, setPendingPin]     = useState(null); // {x, y} in percent
  const [detailPin, setDetailPin]       = useState(null);
  const [markupMode, setMarkupMode]     = useState(false);
  const [annotation, setAnnotation]     = useState(null); // URL string
  const [savingMarkup, setSavingMarkup] = useState(false);
  const overlayRef                      = useRef(null);

  const selected = useMemo(
    () => plan?.revisions.find((r) => r.rev === selectedRev) || plan?.revisions[0],
    [plan, selectedRev]
  );

  const loadPins = useCallback(() => {
    if (!sheetId) return;
    apiFetch(`/projects/${projectId}/plans/${encodeURIComponent(sheetId)}/pins`)
      .then((data) => setPins(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [projectId, sheetId]);

  useEffect(() => { loadPins(); }, [loadPins]);

  useEffect(() => {
    if (!sheetId) return;
    apiFetch(`/projects/${projectId}/plans/${encodeURIComponent(sheetId)}/annotation?rev=${encodeURIComponent(selectedRev)}`)
      .then((d) => {
        if (d?.file_path) setAnnotation(`${API_URL}/${d.file_path}`);
        else setAnnotation(null);
      })
      .catch(() => setAnnotation(null));
  }, [projectId, sheetId, selectedRev]);

  async function handleMarkupSave(blob) {
    setSavingMarkup(true);
    try {
      const token = getToken();
      const fd = new FormData();
      fd.append("image", blob, "annotation.png");
      fd.append("rev", selectedRev);
      const res = await fetch(`${API_URL}/projects/${projectId}/plans/${encodeURIComponent(sheetId)}/annotation`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        const d = await res.json();
        setAnnotation(`${API_URL}/${d.file_path}`);
      }
    } finally {
      setSavingMarkup(false);
      setMarkupMode(false);
    }
  }

  async function handleMarkupClear() {
    if (!confirm("Clear annotation for this sheet?")) return;
    try {
      await apiFetch(`/projects/${projectId}/plans/${encodeURIComponent(sheetId)}/annotation?rev=${encodeURIComponent(selectedRev)}`, { method: "DELETE" });
      setAnnotation(null);
    } catch {}
  }

  function handleOverlayClick(e) {
    if (!pinMode) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width)  * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;
    setPendingPin({ x, y });
    setDetailPin(null);
  }

  function cancelPendingPin() { setPendingPin(null); }

  function onPinPlaced() {
    setPendingPin(null);
    setPinMode(false);
    loadPins();
  }

  if (!plan) {
    return (
      <div>
        <div className="text-lg font-semibold text-slate-900">Sheet not found</div>
        <p className="mt-2 text-slate-600">
          Couldn't find: <span className="font-mono">{sheetId}</span>
        </p>
        <Link
          href={`/projects/${projectId}/plans`}
          className="mt-4 inline-block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:shadow-sm"
        >
          ← Back to Plans
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href={`/projects/${projectId}/plans`} className="text-sm text-slate-600 hover:underline">
            ← Back to Plans
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {plan.sheetNo} — {plan.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs ring-1 ring-slate-200">
              {plan.discipline}
            </span>
            <span className="text-xs text-slate-500">Sheet ID:</span>
            <span className="font-mono text-xs">{plan.sheetId}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600">Revision</label>
          <select
            value={selectedRev}
            onChange={(e) => setSelectedRev(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {plan.revisions.map((r) => (
              <option key={r.rev} value={r.rev}>
                R{r.rev} • {r.status} • {fmtDate(r.date)}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => { setPinMode((v) => !v); setPendingPin(null); setDetailPin(null); }}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              pinMode
                ? "bg-amber-500 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {pinMode ? "✕ Cancel Pin" : "📌 Pin Issue"}
          </button>

          <button
            type="button"
            onClick={() => { setMarkupMode((v) => !v); setPinMode(false); }}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              markupMode
                ? "bg-blue-600 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {markupMode ? "✕ Cancel Markup" : "✏️ Markup"}
          </button>

          {annotation && !markupMode && (
            <button type="button" onClick={handleMarkupClear}
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">
              Clear Markup
            </button>
          )}

          {selected?.fileUrl ? (
            <a
              href={selected.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:opacity-90"
            >
              Open PDF ↗
            </a>
          ) : null}
        </div>
      </div>

      {/* Revision strip */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          {plan.revisions.map((r) => {
            const active = r.rev === selectedRev;
            return (
              <button
                key={r.rev}
                type="button"
                onClick={() => setSelectedRev(r.rev)}
                className={`rounded-xl px-3 py-2 text-sm ring-1 ${
                  active
                    ? "bg-slate-900 text-white ring-slate-900"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                R{r.rev} <span className="ml-2 text-xs opacity-80">{r.status}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 text-sm text-slate-600">
          Selected: <span className="font-semibold text-slate-900">R{selected?.rev}</span> •{" "}
          {fmtDate(selected?.date)}
        </div>
      </div>

      {/* Pin mode banner */}
      {pinMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800">
          📌 Tap anywhere on the drawing to place a pin
        </div>
      )}

      {/* Pins legend */}
      {pins.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-semibold">Pinned issues:</span>
          {pins.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setDetailPin(p.id === detailPin?.id ? null : p); }}
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[p.status] || "#6b7280" }}
              />
              {p.title}
            </button>
          ))}
        </div>
      )}

      {/* Embedded viewer with pin overlay */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {selected?.fileUrl ? (
          <div
            ref={overlayRef}
            style={{ position: "relative" }}
            className={pinMode ? "cursor-crosshair" : ""}
            onClick={handleOverlayClick}
          >
            {/* Transparent overlay in pin mode to capture clicks */}
            {pinMode && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 5,
                  cursor: "crosshair",
                }}
              />
            )}

            <iframe
              title={`Plan ${plan.sheetNo} rev ${selected.rev}`}
              src={selected.fileUrl}
              className="h-[75vh] w-full"
              style={{ pointerEvents: (pinMode || markupMode) ? "none" : "auto" }}
            />

            {/* Annotation overlay (view mode) */}
            {annotation && !markupMode && (
              <img
                src={annotation}
                alt="markup"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none", zIndex: 10 }}
              />
            )}

            {/* Markup canvas (edit mode) */}
            {markupMode && (
              <PlanMarkupCanvas
                containerRef={overlayRef}
                existingUrl={annotation}
                onSave={handleMarkupSave}
                onCancel={() => setMarkupMode(false)}
              />
            )}

            {/* Render existing pins */}
            {pins.map((p) => (
              <PinDot
                key={p.id}
                pin={p}
                onClick={(e) => {
                  e.stopPropagation();
                  if (pinMode) return;
                  setDetailPin(detailPin?.id === p.id ? null : p);
                }}
              />
            ))}

            {/* Detail popup */}
            {detailPin && !pinMode && (
              <PinDetailPopup
                pin={detailPin}
                onClose={() => setDetailPin(null)}
              />
            )}

            {/* Pending pin drop target */}
            {pendingPin && (
              <>
                {/* Drop marker */}
                <div
                  style={{
                    position: "absolute",
                    left:      `${pendingPin.x}%`,
                    top:       `${pendingPin.y}%`,
                    transform: "translate(-50%, -50%)",
                    width:     28,
                    height:    28,
                    borderRadius: "50%",
                    backgroundColor: "#f59e0b",
                    border: "2.5px solid white",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                    zIndex: 25,
                    pointerEvents: "none",
                  }}
                />
                <PlaceForm
                  x={pendingPin.x}
                  y={pendingPin.y}
                  projectId={projectId}
                  sheetId={sheetId}
                  onPlaced={onPinPlaced}
                  onCancel={cancelPendingPin}
                />
              </>
            )}
          </div>
        ) : (
          <div className="p-6 text-sm text-slate-600">No PDF URL set for this revision yet.</div>
        )}
      </div>
    </div>
  );
}
