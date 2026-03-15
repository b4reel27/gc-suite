"use client";

import { useParams } from "next/navigation";
import MobileQuickActions from "../../../../components/MobileQuickActions";

export default function ProjectLayout({ children }) {
  const { projectId } = useParams();

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
    <div className="min-w-0 overflow-x-hidden pb-24">
      {children}
      <MobileQuickActions actions={actions} inset="bottom-5 right-4" />
    </div>
  );
}
