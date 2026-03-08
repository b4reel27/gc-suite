"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtDate } from "../_data";

export default function PlanViewerClient({ projectId, sheetId, plan }) {
  const defaultRev =
    plan?.revisions.find((r) => r.status === "Current")?.rev ||
    plan?.revisions[0]?.rev ||
    "";

  const [selectedRev, setSelectedRev] = useState(defaultRev);

  const selected = useMemo(() => {
    return plan?.revisions.find((r) => r.rev === selectedRev) || plan?.revisions[0];
  }, [plan, selectedRev]);

  if (!plan) {
    return (
      <div>
        <div className="text-lg font-semibold text-slate-900">Sheet not found</div>
        <p className="mt-2 text-slate-600">
          Couldn’t find: <span className="font-mono">{sheetId}</span>
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

        <div className="flex items-center gap-2">
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

      {/* Embedded viewer */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {selected?.fileUrl ? (
          <iframe
            title={`Plan ${plan.sheetNo} rev ${selected.rev}`}
            src={selected.fileUrl}
            className="h-[75vh] w-full"
          />
        ) : (
          <div className="p-6 text-sm text-slate-600">No PDF URL set for this revision yet.</div>
        )}
      </div>
    </div>
  );
}