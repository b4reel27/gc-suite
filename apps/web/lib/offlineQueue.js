const KEY = "gc-offline-queue";

export function enqueueAction(action) {
  const q = JSON.parse(localStorage.getItem(KEY) || "[]");
  q.push({ ...action, id: Date.now().toString(), created: new Date().toISOString() });
  localStorage.setItem(KEY, JSON.stringify(q));
  return q.length;
}

export function getQueue() {
  return JSON.parse(localStorage.getItem(KEY) || "[]");
}

export function clearQueue() {
  localStorage.removeItem(KEY);
}

export async function flushQueue(apiBase, token) {
  const q = getQueue();
  if (!q.length) return { flushed: 0, remaining: 0 };
  let flushed = 0;
  const remaining = [];
  for (const item of q) {
    try {
      const r = await fetch(`${apiBase}${item.path}`, {
        method: item.method || "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
      if (r.ok) flushed++;
      else remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  localStorage.setItem(KEY, JSON.stringify(remaining));
  return { flushed, remaining: remaining.length };
}

export async function createIssueOfflineAware(projectId, payload) {
  const token = localStorage.getItem("token") || "";
  const path = `/projects/${projectId}/punch`;
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
      body: JSON.stringify(payload),
    });
    if (r.ok) return { ok: true, online: true };
  } catch {}
  enqueueAction({ path, method: "POST", body: payload });
  return { ok: true, online: false, queued: true };
}
