"use client";

import { useRouter } from "next/navigation";

export default function OpenProjectButton({ projectId }) {
  const router = useRouter();

  async function open() {
    // set active project cookie
    await fetch("/api/active-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });

    // go to plans (relative route)
    router.push(`/projects/${projectId}/plans`);
  }

  return (
    <button
      type="button"
      onClick={open}
      className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:opacity-90"
    >
      Open
    </button>
  );
}