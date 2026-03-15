"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

export default function ProjectLayout({ children }) {
  const { projectId } = useParams();
  const [captureOpen, setCaptureOpen] = useState(false);

  const actions = [
    {
      label: "New Issue",
      icon: "📸",
      href: `/projects/${projectId}/punch?entry=quick`,
    },
    {
      label: "New Schedule",
      icon: "📅",
      href: `/projects/${projectId}/schedule?entry=quick`,
    },
    {
      label: "Add Photo",
      icon: "📷",
      href: `/projects/${projectId}/punch?entry=photo`,
    },
    {
      label: "Daily Log",
      icon: "📝",
      href: `/projects/${projectId}/daily-log`,
    },
  ];

  return (
    <div className="min-w-0 overflow-x-hidden pb-8">
      {children}

      {captureOpen ? (
        <button
          type="button"
          aria-label="Close quick capture menu"
          className="fixed inset-0 z-40 bg-black/45 md:hidden"
          onClick={() => setCaptureOpen(false)}
        />
      ) : null}

      <div className="fixed bottom-8 right-4 z-50 md:hidden">
        {captureOpen ? (
          <div className="mb-3 w-72 overflow-hidden rounded-[28px] border border-slate-700 bg-black shadow-[0_24px_60px_rgba(0,0,0,.5)]">
            <div className="border-b border-slate-800 px-4 py-4">
              <div className="text-base font-bold text-white">Quick Capture</div>
              <div className="mt-1 text-sm text-slate-400">
                Add something fast from the field
              </div>
            </div>

            <div className="p-2">
              {actions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  onClick={() => setCaptureOpen(false)}
                  className="flex items-center justify-between rounded-2xl px-3 py-3 text-base font-semibold text-white transition hover:bg-slate-950"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-xl">{action.icon}</span>
                    <span>{action.label}</span>
                  </span>
                  <span className="text-[#60a5fa]">→</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          aria-label={captureOpen ? "Close quick capture" : "Open quick capture"}
          onClick={() => setCaptureOpen((v) => !v)}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-700 bg-[#1d4ed8] text-3xl font-semibold text-white shadow-[0_16px_40px_rgba(0,0,0,.45)] transition hover:bg-[#2563eb]"
        >
          {captureOpen ? "×" : "+"}
        </button>
      </div>
    </div>
  );
}