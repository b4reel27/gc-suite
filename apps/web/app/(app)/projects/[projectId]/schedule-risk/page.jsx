"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function ScheduleRiskPage() {
  const params = useParams();
  const projectId = params?.projectId;
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem("token") || "";
        const r = await fetch(`${API_URL}/projects/${projectId}/schedule-risk`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed");
        setAlerts(data.alerts || []);
      } catch (e) {
        setError(e.message || "Failed to load risks");
      }
      setLoading(false);
    }
    if (projectId) load();
  }, [projectId]);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Schedule Risk Alerts</h1>
      {loading && <div className="text-sm text-slate-500">Checking risks…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {!loading && alerts.length === 0 && <div className="text-sm text-slate-500">No risks detected.</div>}
      {alerts.map((a, i) => (
        <div key={i} className={`border rounded p-3 text-sm ${a.severity === "high" ? "border-red-300 bg-red-50" : a.severity === "medium" ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
          <div className="font-medium">{a.message}</div>
          {a.related && <div className="text-xs text-slate-500 mt-1">{a.related}</div>}
        </div>
      ))}
    </div>
  );
}
