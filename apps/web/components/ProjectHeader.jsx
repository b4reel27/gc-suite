"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

const tabs = [
  { label: "Plans", path: "plans" },
  { label: "Issues", path: "punch" },
  { label: "Schedule", path: "schedule" },
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
    <div className="mb-4 overflow-hidden rounded-[28px] border border-slate-700 bg-black shadow-[0_0_0_1px_rgba(30,41,59,.2)]">
      <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="truncate text-2xl font-extrabold tracking-tight text-white sm:text-xl">
            {projectName || "Project"}
          </div>
          {location ? (
            <div className="mt-1 text-sm text-slate-400">{location}</div>
          ) : null}
        </div>

        <Link
          href="/projects"
          className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-600 bg-black px-4 py-3 text-base font-semibold text-[#3b82f6] transition hover:border-[#2563eb] hover:text-[#60a5fa] sm:w-auto sm:text-sm"
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
                className={`rounded-2xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition ${
                  active
                    ? "bg-[#1d4ed8] text-white"
                    : "border border-slate-700 bg-black text-[#3b82f6] hover:border-[#2563eb] hover:text-[#60a5fa]"
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