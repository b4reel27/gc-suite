"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export default function MobileQuickActions({
  actions = [],
  inset = "bottom-5 right-4",
}) {
  const [open, setOpen] = useState(false);

  const safeActions = useMemo(
    () => actions.filter((a) => a && a.label && a.href),
    [actions]
  );

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close quick actions overlay"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[70] bg-slate-900/20 backdrop-blur-[1px] md:hidden"
        />
      ) : null}

      <div className={`fixed ${inset} z-[80] md:hidden`}>
        <div className="flex flex-col items-end gap-3">
          {open ? (
            <div className="w-64 overflow-hidden rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
              <div className="px-2 pb-2 pt-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Quick Add
                </div>
              </div>

              <div className="space-y-2">
                {safeActions.map((action) => (
                  <Link
                    key={`${action.label}-${action.href}`}
                    href={action.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-lg">
                      {action.icon || "➕"}
                    </span>
                    <div className="flex-1">{action.label}</div>
                    <span className="text-slate-400">→</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            aria-label={open ? "Close quick actions" : "Open quick actions"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={`flex h-14 w-14 items-center justify-center rounded-full border shadow-lg transition active:scale-95 ${
              open
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-900"
            }`}
          >
            <span className="text-2xl leading-none">{open ? "×" : "+"}</span>
          </button>
        </div>
      </div>
    </>
  );
}