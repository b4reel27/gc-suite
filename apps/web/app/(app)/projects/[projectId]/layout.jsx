"use client";

import { useParams } from "next/navigation";
import MobileQuickActions from "../../../../components/MobileQuickActions";

export default function ProjectLayout({ children }) {
  const { projectId } = useParams();

  const actions = [
    {
      label: "Daily Log",
      icon: "📝",
      href: `/projects/${projectId}/daily-log`,
    },
    {
      label: "New RFI",
      icon: "📨",
      href: `/projects/${projectId}/rfis`,
    },
    {
      label: "Forms / JSA",
      icon: "📋",
      href: `/projects/${projectId}/forms`,
    },
    {
      label: "Add Photo",
      icon: "📷",
      subLabel: "Add Photo to…",
      subActions: [
        {
          label: "Issue",
          icon: "⚠️",
          href: `/projects/${projectId}/punch?entry=photo`,
        },
        {
          label: "Schedule Item",
          icon: "📅",
          href: `/projects/${projectId}/schedule?entry=photo`,
        },
        {
          label: "Daily Log",
          icon: "📝",
          href: `/projects/${projectId}/daily-log`,
        },
      ],
    },
  ];

  return (
    <div className="min-w-0 overflow-x-hidden pb-24">
      {children}
      <MobileQuickActions actions={actions} inset="bottom-5 right-4" />
    </div>
  );
}
