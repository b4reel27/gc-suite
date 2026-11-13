"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function SubViewPage() {
  const params = useParams();
  const projectId = params?.projectId;
  const [issues, setIssues] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    const token = localStorage.getItem("token") || "";
    const headers = { Authorization: token ? `Bearer ${token}` : "" };
    Promise.all([
      fetch(`${API_URL}/projects/${projectId}/punch`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${API_URL}/projects/${projectId}/plans`, { headers }).then(r => r.ok ? r.json() : { sheets: [] }),
    ]).then(([iss, pl]) => {
      setIssues(Array.isArray(iss) ? iss.filter(i => i.status !== "CLOSED") : []);
      setPlans(Array.isArray(pl?.sheets) ? pl.sheets : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading sub view…</div>;

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Subcontractor View</h1>
        <p className="text-sm text-slate-500">Read-only — open issues and plans</p>
      </div>

      <section>
        <h2 className="font-medium text-sm mb-2">Open Work ({issues.length})</h2>
        {issues.length === 0 ? (
          <p className="text-sm text-slate-400">No open items.</p>
        ) : (
          <ul className="space-y-2">
            {issues.map(i => (
              <li key={i.id} className="border rounded p-3 text-sm bg-white">
                <div className="font-medium">{i.title || "Untitled"}</div>
                <div className="text-xs text-slate-500">{i.location || ""} · {i.trade || ""} · {i.status}</div>
                {i.description && <div className="mt-1 text-xs">{i.description}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-medium text-sm mb-2">Plans ({plans.length})</h2>
        {plans.length === 0 ? (
          <p className="text-sm text-slate-400">No plans.</p>
        ) : (
          <ul className="space-y-1">
            {plans.map(p => (
              <li key={p.sheetId || p.id}>
                <Link
                  href={`/projects/${projectId}/plans/${encodeURIComponent(p.sheetId || p.sheetNo || "")}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {p.sheetNo || p.sheetId} — {p.title || "Untitled"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href={`/projects/${projectId}`} className="text-xs text-slate-500 hover:underline">← Back to project</Link>
    </div>
  );
}
