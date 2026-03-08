export function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function getCurrentRev(plan) {
  const current = plan.revisions?.find((r) => r.status === "Current");
  return current || plan.revisions?.[0] || null;
}

export async function getPlansForProject(projectId) {
  const base = process.env.API_BASE_URL || "http://localhost:3005";

  const resp = await fetch(`${base}/projects/${projectId}/plans`, { cache: "no-store" });
  if (!resp.ok) return [];

  const data = await resp.json();
  const sheets = data?.sheets || [];

  return sheets.map((s) => ({
    ...s,
    current: getCurrentRev(s),
  }));
}

export async function getPlanBySheetId(projectId, sheetId) {
  const plans = await getPlansForProject(projectId);
  return plans.find((p) => p.sheetId === sheetId) || null;
}