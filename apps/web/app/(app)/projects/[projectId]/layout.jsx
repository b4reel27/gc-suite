"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

export default function ProjectLayout({ children }) {
  const { projectId } = useParams();
  const [captureOpen, setCaptureOpen] = useState(false);

  const actions = [
    {
      label: "Capture Issue",
      href: `/projects/${projectId}/punch?entry=quick`,
    },
    {
      label: "Capture Photo",
      href: `/projects/${projectId}/punch?entry=photo`,
    },
    {
      label: "Capture Schedule",
      href: `/projects/${projectId}/schedule?entry=quick`,
    },
    {
      label: "Plans",
      href: `/projects/${projectId}/plans`,
    },
  ];

  return (
    <div className="min-w-0 overflow-x-hidden pb-6">
      {children}

      {captureOpen ? (
        <button
          type="button"
          aria-label="Close capture menu"
          className="fixed inset-0 z-40 bg-black/55 md:hidden"
          onClick={() => setCaptureOpen(false)}
        />
      ) : null}

      <div className="fixed bottom-5 right-5 z-50 md:hidden">
        {captureOpen ? (
          <div className="mb-3 w-56 overflow-hidden rounded-[24px] border border-slate-700 bg-black shadow-[0_20px_50px_rgba(0,0,0,.45)]">
            <div className="border-b border-slate-800 px-4 py-3">
              <div className="text-sm font-bold text-white">Quick Capture</div>
              <div className="text-xs text-slate-400">
                Add something fast from the field
              </div>
            </div>

            <div className="p-2">
              {actions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  onClick={() => setCaptureOpen(false)}
                  className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-semibold text-white transition hover:bg-slate-950"
                >
                  <span>{action.label}</span>
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
          className={`flex h-14 w-14 items-center justify-center rounded-full border border-slate-700 text-3xl font-semibold text-white shadow-[0_16px_40px_rgba(0,0,0,.45)] transition ${
            captureOpen
              ? "bg-slate-900"
              : "bg-[#1d4ed8] hover:bg-[#2563eb]"
          }`}
        >
          {captureOpen ? "×" : "+"}
        </button>
      </div>
    </div>
  );
}