"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function GlobalSearch({ projectId }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function search(e) {
    e?.preventDefault();
    if (!q.trim() || !projectId) return;
    const token = localStorage.getItem("token") || "";
    const headers = { Authorization: token ? `Bearer ${token}` : "" };
    const [issues, logs] = await Promise.all([
      fetch(`${API_URL}/projects/${projectId}/punch`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${API_URL}/projects/${projectId}/daily-logs`, { headers }).then(r => r.ok ? r.json() : []),
    ]);
    const term = q.toLowerCase();
    const matches = [];
    (Array.isArray(issues) ? issues : []).forEach(i => {
      if ((i.title || "").toLowerCase().includes(term) || (i.description || "").toLowerCase().includes(term)) {
        matches.push({ type: "Issue", title: i.title, id: i.id, path: "punch" });
      }
    });
    (Array.isArray(logs) ? logs : []).forEach(l => {
      const text = (l.notes || l.note || l.title || "").toLowerCase();
      if (text.includes(term)) matches.push({ type: "Daily Log", title: (l.notes || l.note || "").slice(0, 60), id: l.id, path: "daily-log" });
    });
    setResults(matches.slice(0, 12));
    setOpen(true);
  }

  return (
    <div className="relative">
      <form onSubmit={search} className="flex gap-1">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search issues, logs…"
          className="text-xs px-2 py-1 border rounded w-40"
        />
        <button type="submit" className="text-xs px-2 py-1 bg-slate-800 text-white rounded">Search</button>
      </form>
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-64 bg-white border rounded shadow text-xs max-h-48 overflow-auto">
          {results.map((r, i) => (
            <button
              key={i}
              className="block w-full text-left px-2 py-1.5 hover:bg-slate-50"
              onClick={() => { setOpen(false); router.push(`/projects/${projectId}/${r.path}`); }}
            >
              <span className="text-slate-400">{r.type}</span> · {r.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
