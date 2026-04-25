"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export default function MobileQuickActions({
  actions = [],
  inset = "bottom-5 right-4",
}) {
  const [open, setOpen] = useState(false);
  const [subMenu, setSubMenu] = useState(null); // label of action whose subActions are shown

  const safeActions = useMemo(
    () => actions.filter((a) => a && a.label && (a.href || a.subActions || a.onClick)),
    [actions]
  );

  function close() {
    setOpen(false);
    setSubMenu(null);
  }

  const subAction = subMenu ? safeActions.find((a) => a.label === subMenu) : null;

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close quick actions overlay"
          onClick={close}
          className="fixed inset-0 z-[70] bg-slate-900/20 backdrop-blur-[1px] md:hidden"
        />
      ) : null}

      <div className={`fixed ${inset} z-[80] md:hidden`}>
        <div className="flex flex-col items-end gap-3">
          {open ? (
            <div className="w-64 overflow-hidden rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">

              {/* Sub-menu */}
              {subAction ? (
                <>
                  <div className="flex items-center gap-2 px-2 pb-2 pt-1">
                    <button
                      onClick={() => setSubMenu(null)}
                      className="text-slate-400 hover:text-slate-700"
                      aria-label="Back"
                    >
                      ←
                    </button>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {subAction.subLabel || subAction.label}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(subAction.subActions || []).map((sub) => (
                      <Link
                        key={sub.label}
                        href={sub.href}
                        onClick={close}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-lg">
                          {sub.icon || "➕"}
                        </span>
                        <div className="flex-1">{sub.label}</div>
                        <span className="text-slate-400">→</span>
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                /* Main menu */
                <>
                  <div className="px-2 pb-2 pt-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Quick Add
                    </div>
                  </div>
                  <div className="space-y-2">
                    {safeActions.map((action) =>
                      action.subActions ? (
                        <button
                          key={action.label}
                          type="button"
                          onClick={() => setSubMenu(action.label)}
                          className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-lg">
                            {action.icon || "➕"}
                          </span>
                          <div className="flex-1 text-left">{action.label}</div>
                          <span className="text-slate-400">›</span>
                        </button>
                      ) : action.onClick ? (
                        <button
                          key={action.label}
                          type="button"
                          onClick={() => { close(); action.onClick(); }}
                          className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm transition hover:bg-slate-50 ${
                            action.highlight
                              ? "border-slate-800 bg-slate-900 text-white hover:bg-slate-800"
                              : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                          }`}
                        >
                          <span className={`flex h-10 w-10 items-center justify-center rounded-2xl text-lg ${action.highlight ? "bg-white/10" : "bg-slate-100"}`}>
                            {action.icon || "➕"}
                          </span>
                          <div className="flex-1 text-left">{action.label}</div>
                          <span className={action.highlight ? "text-white/60" : "text-slate-400"}>→</span>
                        </button>
                      ) : (
                        <Link
                          key={`${action.label}-${action.href}`}
                          href={action.href}
                          onClick={close}
                          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-lg">
                            {action.icon || "➕"}
                          </span>
                          <div className="flex-1">{action.label}</div>
                          <span className="text-slate-400">→</span>
                        </Link>
                      )
                    )}
                  </div>
                </>
              )}
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
