"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export default function ProjectHeader({ projectName, location }) {
  const { projectId } = useParams();

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Project title */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <div className="text-lg font-semibold text-slate-900">
            {projectName || "Project"}
          </div>
          {location ? <div className="text-xs text-slate-500">{location}</div> : null}
        </div>

        <Link
          href="/projects"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          Change Project
        </Link>
      </div>

      {/* Project tools */}
      <div className="flex gap-4 px-5 py-3 text-sm">
        <Link
          href={`/projects/${projectId}/plans`}
          className="text-slate-700 hover:text-black"
        >
          Plans
        </Link>

        {/* ✅ Keep route /punch for now, just rename label */}
        <Link
          href={`/projects/${projectId}/punch`}
          className="text-slate-700 hover:text-black"
        >
          Issues
        </Link>

        <Link
          href={`/projects/${projectId}/schedule`}
          className="text-slate-700 hover:text-black"
        >
          Schedule
        </Link>

        <Link
          href={`/projects/${projectId}/rfi`}
          className="text-slate-700 hover:text-black"
        >
          RFI
        </Link>

        <Link
          href={`/projects/${projectId}/submittals`}
          className="text-slate-700 hover:text-black"
        >
          Submittals
        </Link>
      </div>
    </div>
  );
}