// Simple offline action queue using localStorage
const KEY = "gc-offline-queue";

export function enqueueAction(action) {
  const q = JSON.parse(localStorage.getItem(KEY) || "[]");
  q.push({ ...action, id: Date.now().toString(), created: new Date().toISOString() });
  localStorage.setItem(KEY, JSON.stringify(q));
}

export function getQueue() {
  return JSON.parse(localStorage.getItem(KEY) || "[]");
}

export function clearQueue() {
  localStorage.removeItem(KEY);
}

export async function flushQueue(apiBase, token) {
  const q = getQueue();
  if (!q.length) return { flushed: 0 };
  let flushed = 0;
  for (const item of q) {
    try {
      const r = await fetch(`${apiBase}${item.path}`, {
        method: item.method || "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
      if (r.ok) flushed++;
    } catch {}
  }
  if (flushed === q.length) clearQueue();
  return { flushed, remaining: q.length - flushed };
}
