"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtDate } from "../_data";

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
    apiFetch(`/punch?projectId=${projectId}`)
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
              style={{ pointerEvents: pinMode ? "none" : "auto" }}
            />

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
