"use client";

export default function ProjectHeader({ projectName, location }) {
  return (
    <div className="mb-4 flex items-baseline gap-2">
      <h1 className="truncate text-xl font-extrabold tracking-tight text-slate-900">
        {projectName || "Project"}
      </h1>
      {location ? (
        <span className="shrink-0 text-sm text-slate-500">{location}</span>
      ) : null}
    </div>
  );
}
