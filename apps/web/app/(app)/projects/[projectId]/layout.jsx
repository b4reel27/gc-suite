"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import MobileQuickActions from "../../../../components/MobileQuickActions";
import SmartCaptureModal from "../../../../components/SmartCaptureModal";

export default function ProjectLayout({ children }) {
  const { projectId } = useParams();
  const [showCapture, setShowCapture] = useState(false);

  const actions = [
    {
      label:     "Smart Capture",
      icon:      "✨",
      highlight: true,
      onClick:   () => setShowCapture(true),
    },
    {
      label: "Daily Log",
      icon:  "📝",
      href:  `/projects/${projectId}/daily-log`,
    },
    {
      label: "New RFI",
      icon:  "📨",
      href:  `/projects/${projectId}/rfis`,
    },
    {
      label: "Forms / JSA",
      icon:  "📋",
      href:  `/projects/${projectId}/forms`,
    },
    {
      label: "Add Photo",
      icon:  "📷",
      href:  `/projects/${projectId}/punch?entry=photo`,
    },
  ];

  return (
    <div className="min-w-0 overflow-x-hidden pb-24">
      {children}
      <MobileQuickActions actions={actions} inset="bottom-5 right-4" />
      {showCapture && (
        <SmartCaptureModal
          projectId={projectId}
          onClose={() => setShowCapture(false)}
        />
      )}
    </div>
  );
}
