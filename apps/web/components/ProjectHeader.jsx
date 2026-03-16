"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

const tabs = [
  { label: "Plans", path: "plans" },
  { label: "Issues", path: "punch" },
  { label: "Schedule", path: "schedule" },
  { label: "Daily Log", path: "daily-log" },
  { label: "RFI", path: "rfi" },
  { label: "Submittals", path: "submittals" },
];

export default function ProjectHeader({ projectName, location }) {
  const { projectId } = useParams();
  const pathname = usePathname();

  function isActive(path) {
    return pathname === `/projects/${projectId}/${path}`;
  }

  return (
    <div className="mb-4 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="truncate text-2xl font-extrabold tracking-tight text-slate-900 sm:text-xl">
            {projectName || "Project"}
          </div>
          {location ? (
            <div className="mt-1 text-sm text-slate-500">{location}</div>
          ) : null}
        </div>

        <Link
          href="/projects"
          className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 sm:w-auto sm:text-sm"
        >
          Change Project
        </Link>
      </div>

      <div className="overflow-x-auto px-3 py-3 scrollbar-hide sm:px-5">
        <div className="flex min-w-max gap-2">
          {tabs.map((tab) => {
            const active = isActive(tab.path);

            return (
              <Link
                key={tab.path}
                href={`/projects/${projectId}/${tab.path}`}
                className={`inline-flex min-h-[44px] items-center justify-center rounded-2xl border px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition focus:outline-none focus:ring-2 focus:ring-slate-300 ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}