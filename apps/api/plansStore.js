import fs from "fs/promises";
import path from "path";

const DATA_ROOT = path.join(process.cwd(), "data", "projects");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function plansFilePath(projectId) {
  return path.join(DATA_ROOT, projectId, "plans.json");
}

export async function readPlans(projectId) {
  const file = plansFilePath(projectId);
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw);

    // normalize
    if (!parsed.sheets) parsed.sheets = [];
    parsed.projectId = projectId;

    // normalize statuses/casing
    for (const s of parsed.sheets) {
      if (!s.revisions) s.revisions = [];
      for (const r of s.revisions) {
        r.rev = String(r.rev);
        r.status = normalizeStatus(r.status);
      }
    }

    return parsed;
  } catch {
    return { projectId, sheets: [] };
  }
}

export async function writePlans(projectId, data) {
  const dir = path.join(DATA_ROOT, projectId);
  await ensureDir(dir);
  const file = plansFilePath(projectId);
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Statuses we will enforce:
 * - "PENDING"
 * - "CURRENT"
 * - "SUPERSEDED"
 */
function normalizeStatus(s) {
  const v = String(s || "").trim().toUpperCase();
  if (v === "CURRENT") return "CURRENT";
  if (v === "SUPERSEDED") return "SUPERSEDED";
  if (v === "PENDING") return "PENDING";
  // backward compat: "Current"/"Superseded"
  if (String(s).toLowerCase() === "current") return "CURRENT";
  if (String(s).toLowerCase() === "superseded") return "SUPERSEDED";
  return "PENDING";
}

export function computeCurrent(sheet) {
  const current = (sheet.revisions || []).find((r) => normalizeStatus(r.status) === "CURRENT");
  return current || (sheet.revisions || [])[0] || null;
}

/**
 * Upsert sheet + add revision.
 * If status === CURRENT, supersede any CURRENT revision.
 * If status === PENDING, do not supersede current.
 */
export function upsertSheetAndRevision(store, payload) {
  const {
    sheetId,
    sheetNo,
    title,
    discipline,
    rev,
    revDate,
    fileUrl,
    status, // optional: "PENDING" | "CURRENT"
  } = payload;

  if (!sheetId || !sheetNo || !title || !discipline || rev === undefined || !revDate || !fileUrl) {
    const err = new Error("Missing required fields");
    err.status = 400;
    throw err;
  }

  const nextStatus = normalizeStatus(status || "CURRENT");

  let sheet = store.sheets.find((s) => s.sheetId === sheetId);

  if (!sheet) {
    sheet = { sheetId, sheetNo, title, discipline, revisions: [] };
    store.sheets.push(sheet);
  } else {
    // update sheet metadata
    sheet.sheetNo = sheetNo;
    sheet.title = title;
    sheet.discipline = discipline;
    if (!sheet.revisions) sheet.revisions = [];
  }

  // If we're setting a CURRENT revision, supersede existing CURRENT
  if (nextStatus === "CURRENT") {
    for (const r of sheet.revisions) {
      if (normalizeStatus(r.status) === "CURRENT") r.status = "SUPERSEDED";
      else r.status = normalizeStatus(r.status);
    }
  } else {
    // normalize existing statuses
    for (const r of sheet.revisions) r.status = normalizeStatus(r.status);
  }

  const revStr = String(rev);
  const existingRev = sheet.revisions.find((r) => String(r.rev) === revStr);

  if (existingRev) {
    existingRev.date = revDate;
    existingRev.fileUrl = fileUrl;
    existingRev.status = nextStatus;
  } else {
    sheet.revisions.unshift({
      rev: revStr,
      date: revDate,
      status: nextStatus,
      fileUrl,
    });
  }

  return store;
}

/**
 * Approve a revision: sets it CURRENT and supersedes any existing CURRENT.
 */
export function approveRevision(store, sheetId, rev) {
  const sheet = store.sheets.find((s) => s.sheetId === sheetId);
  if (!sheet) {
    const err = new Error("Sheet not found");
    err.status = 404;
    throw err;
  }

  const revStr = String(rev);
  const target = (sheet.revisions || []).find((r) => String(r.rev) === revStr);
  if (!target) {
    const err = new Error("Revision not found");
    err.status = 404;
    throw err;
  }

  // supersede current
  for (const r of sheet.revisions) {
    r.status = normalizeStatus(r.status);
    if (r.status === "CURRENT") r.status = "SUPERSEDED";
  }

  target.status = "CURRENT";
  return store;
}

/**
 * Optional manual supersede.
 */
export function supersedeRevision(store, sheetId, rev) {
  const sheet = store.sheets.find((s) => s.sheetId === sheetId);
  if (!sheet) {
    const err = new Error("Sheet not found");
    err.status = 404;
    throw err;
  }

  const revStr = String(rev);
  const target = (sheet.revisions || []).find((r) => String(r.rev) === revStr);
  if (!target) {
    const err = new Error("Revision not found");
    err.status = 404;
    throw err;
  }

  target.status = "SUPERSEDED";
  return store;
}

/**
 * Search/filter helper for API list endpoint.
 */
export function filterSheets(store, { q = "", discipline = "" } = {}) {
  const query = String(q || "").trim().toLowerCase();
  const disc = String(discipline || "").trim().toUpperCase();

  return (store.sheets || []).filter((s) => {
    if (disc && String(s.discipline || "").toUpperCase() !== disc) return false;
    if (!query) return true;

    return (
      String(s.sheetNo || "").toLowerCase().includes(query) ||
      String(s.sheetId || "").toLowerCase().includes(query) ||
      String(s.title || "").toLowerCase().includes(query)
    );
  });
}