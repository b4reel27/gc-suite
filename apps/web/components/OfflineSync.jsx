"use client";
import { useState, useEffect } from "react";
import { flushQueue, getQueue } from "../lib/offlineQueue";

export default function OfflineSync() {
  const [pending, setPending] = useState(0);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setPending(getQueue().length);
  }, []);

  async function sync() {
    const token = localStorage.getItem("token") || "";
    const result = await flushQueue(process.env.NEXT_PUBLIC_API_URL || "", token);
    setPending(result.remaining);
    setMsg(result.flushed ? `Synced ${result.flushed}` : "Nothing to sync");
    setTimeout(() => setMsg(""), 2000);
  }

  if (pending === 0 && !msg) return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      {pending > 0 && <span className="text-amber-600">{pending} offline</span>}
      <button onClick={sync} className="px-2 py-0.5 bg-amber-500 text-white rounded">Sync</button>
      {msg && <span className="text-slate-500">{msg}</span>}
    </div>
  );
}
