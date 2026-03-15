"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

export default function ProjectLayout({ children }) {
  const { projectId } = useParams();
  const pathname = usePathname();

  const tabs = [
    { name: "Plans", path: "plans" },
    { name: "Schedule", path: "schedule" },
    { name: "Issues", path: "punch" },
    { name: "Submittals", path: "submittals" },
    { name: "Pay Apps", path: "payapps" },
    { name: "RFIs", path: "rfis" },
  ];

  return (
    <div className="min-w-0 overflow-x-hidden pb-20 md:pb-0">
      <div className="px-0 py-0">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-black/95 px-2 py-2 backdrop-blur md:hidden">
        <div className="grid grid-cols-3 gap-2">
          {tabs.map((tab) => {
            const href = `/projects/${projectId}/${tab.path}`;
            const active = pathname === href;

            return (
              <Link
                key={tab.name}
                href={href}
                className={`rounded-2xl px-2 py-2 text-center text-[11px] font-bold transition ${
                  active
                    ? "bg-[#1d4ed8] text-white"
                    : "border border-slate-800 bg-slate-950 text-slate-300"
                }`}
              >
                {tab.name}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}