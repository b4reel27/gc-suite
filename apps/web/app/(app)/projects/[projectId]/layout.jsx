"use client";

import { useParams } from "next/navigation";

export default function ProjectLayout({ children }) {
  const { projectId } = useParams();

  const tabs = [
    { name: "Plans", path: "plans" },
    { name: "Schedule", path: "schedule" },
    { name: "Issues", path: "punch" }, // label changed, route stays the same
    { name: "Submittals", path: "submittals" },
    { name: "Pay Apps", path: "payapps" },
    { name: "RFIs", path: "rfis" },
  ];

  return (
    <div style={{ paddingBottom: 70 }}>
      <div style={{ padding: 20 }}>
        {children}
      </div>

      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-around",
          background: "#111827",
          padding: 12,
        }}
      >
        {tabs.map((t) => (
          <a
            key={t.name}
            href={`/projects/${projectId}/${t.path}`}
            style={{
              color: "white",
              fontSize: 12,
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            {t.name}
          </a>
        ))}
      </nav>
    </div>
  );
}