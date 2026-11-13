"use client";
import { useState } from "react";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function BidLevelingPage() {
  const params = useParams();
  const projectId = params?.projectId;
  const [division, setDivision] = useState("03 - Concrete");
  const [quotes, setQuotes] = useState([
    { company: "", amount: "", inclusions: "", exclusions: "", notes: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function updateQuote(i, field, value) {
    setQuotes(qs => qs.map((q, idx) => idx === i ? { ...q, [field]: value } : q));
  }

  function addQuote() {
    setQuotes(qs => [...qs, { company: "", amount: "", inclusions: "", exclusions: "", notes: "" }]);
  }

  async function level() {
    const valid = quotes.filter(q => q.company && q.amount);
    if (!valid.length) { setError("Add at least one quote with company and amount."); return; }
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${API_URL}/projects/${projectId}/bid-leveling`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ division, quotes: valid.map(q => ({ ...q, amount: Number(q.amount) })) }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      setResult(data);
    } catch (e) {
      setError(e.message || "Leveling failed");
    }
    setLoading(false);
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Bid Leveling</h1>
      <div>
        <label className="block text-sm font-medium mb-1">Division</label>
        <input value={division} onChange={e => setDivision(e.target.value)} className="border rounded px-3 py-2 text-sm w-full" />
      </div>
      {quotes.map((q, i) => (
        <div key={i} className="border rounded p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Company" value={q.company} onChange={e => updateQuote(i, "company", e.target.value)} className="border rounded px-2 py-1 text-sm" />
            <input placeholder="Amount" type="number" value={q.amount} onChange={e => updateQuote(i, "amount", e.target.value)} className="border rounded px-2 py-1 text-sm" />
          </div>
          <input placeholder="Inclusions" value={q.inclusions} onChange={e => updateQuote(i, "inclusions", e.target.value)} className="border rounded px-2 py-1 text-sm w-full" />
          <input placeholder="Exclusions" value={q.exclusions} onChange={e => updateQuote(i, "exclusions", e.target.value)} className="border rounded px-2 py-1 text-sm w-full" />
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={addQuote} className="px-3 py-1.5 border rounded text-sm">+ Add Quote</button>
        <button onClick={level} disabled={loading} className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
          {loading ? "Leveling…" : "Level Bids"}
        </button>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {result && (
        <div className="border rounded p-3 bg-slate-50">
          <div className="text-sm font-medium mb-2">Low complete: ${result.lowComplete?.toLocaleString() || "—"}</div>
          <div className="text-xs text-slate-600 mb-2">{result.notes}</div>
          {(result.quotes || []).map((q, i) => (
            <div key={i} className="text-xs border-t pt-1 mt-1">
              <span className="font-medium">{q.company}</span> · ${q.amount?.toLocaleString()} → adjusted ${q.adjustedAmount?.toLocaleString() || "—"}
              {q.scopeGaps?.length > 0 && <div className="text-amber-700">Gaps: {q.scopeGaps.join(", ")}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
