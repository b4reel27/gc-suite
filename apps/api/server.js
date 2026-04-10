import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import {
  readPlans,
  writePlans,
  upsertSheetAndRevision,
  filterSheets,
  approveRevision,
  supersedeRevision,
} from "./plansStore.js";

dotenv.config();

const app = express();

/* CONFIG */

const PORT = Number(process.env.PORT || 3005);
const HOST = process.env.HOST || "0.0.0.0";

const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("JWT_SECRET must be set");
  process.exit(1);
}

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

/* DB */

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false,
});

/* MIDDLEWARE */

app.use(cors());
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOAD_ROOT));

/* HELPERS */

function apiError(res, code, msg, extra = {}) {
  return res.status(code).json({ error: msg, ...extra });
}

function signSessionToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;

  if (!token) return apiError(res, 401, "Missing token");

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return apiError(res, 401, "Invalid token");
  }
}

function normalizeDateInput(value) {
  if (!value) return null;

  const str = String(value).trim();
  if (!str) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const d = new Date(str);
  if (!Number.isFinite(d.getTime())) return null;

  return d.toISOString().slice(0, 10);
}

function isGcRole(role) {
  return String(role || "").toUpperCase().startsWith("GC");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

async function getUserDisplayName(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(NULLIF(name, ''), email, 'User') AS display_name
       FROM users
       WHERE id = $1`,
      [userId]
    );
    return rows[0]?.display_name || "User";
  } catch {
    return "User";
  }
}

async function getProjectMembership(projectId, userId) {
  const { rows } = await pool.query(
    `SELECT role, company_id
     FROM project_members
     WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId]
  );

  return rows[0] || null;
}

async function requireProjectMember(projectId, userId) {
  const membership = await getProjectMembership(projectId, userId);

  if (!membership) {
    const err = new Error("Not in project");
    err.status = 403;
    throw err;
  }

  return membership;
}

async function requireGcMembership(projectId, userId) {
  const membership = await requireProjectMember(projectId, userId);

  if (!isGcRole(membership.role)) {
    const err = new Error("GC only");
    err.status = 403;
    throw err;
  }

  return membership;
}

function handleThrownAccessError(res, err) {
  if (err?.status) {
    return apiError(res, err.status, err.message || "Access denied");
  }
  return apiError(res, 500, "Server error");
}

async function getIssue(issueId) {
  const { rows } = await pool.query(
    `SELECT id, project_id, assigned_company_id, status
     FROM issues
     WHERE id = $1`,
    [issueId]
  );

  return rows[0] || null;
}

function requireIssueAccess(membership, issue) {
  if (isGcRole(membership.role)) {
    return { ok: true, isGC: true };
  }

  if (!issue.assigned_company_id) {
    return { ok: false, status: 403, error: "Unassigned item (GC only for now)" };
  }

  if (membership.company_id !== issue.assigned_company_id) {
    return { ok: false, status: 403, error: "Not your company’s item" };
  }

  return { ok: true, isGC: false };
}

function normalizePunchStatus(status) {
  const s = String(status || "").trim().toUpperCase();
  if (s === "PENDING_VERIFICATION") return "DONE";
  return s || "OPEN";
}

function normalizeScheduleStatus(status) {
  const s = String(status || "").trim().toUpperCase();
  if (!s) return "OPEN";
  if (["DONE", "COMPLETE", "COMPLETED", "FINISHED"].includes(s)) return "DONE";
  if (["VERIFIED", "VERIFY"].includes(s)) return "VERIFIED";
  if (["CANCELED", "CANCELLED", "CANCEL"].includes(s)) return "CANCELED";
  return "OPEN";
}

async function getScheduleItem(scheduleId) {
  const { rows } = await pool.query(
    `SELECT id, project_id, status
     FROM schedule_items
     WHERE id = $1`,
    [scheduleId]
  );

  return rows[0] || null;
}

async function logActivity(projectId, userName, action, type, title) {
  try {
    await pool.query(
      `INSERT INTO project_activity
       (project_id, user_name, action, item_type, item_title)
       VALUES ($1, $2, $3, $4, $5)`,
      [projectId, userName, action, type, title]
    );
  } catch (e) {
    console.error("Activity log error:", e);
  }
}

/* STARTUP */

(async () => {
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });

  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_activity (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid,
      user_name text,
      action text,
      item_type text,
      item_title text,
      created_at timestamptz DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jsa_forms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_by_user_id UUID NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
      work_description TEXT,
      work_location TEXT,
      jsa_date DATE,
      superintendent_name TEXT,
      emergency_contacts JSONB NOT NULL DEFAULT '{}',
      hazards            JSONB NOT NULL DEFAULT '[]',
      ppe                JSONB NOT NULL DEFAULT '[]',
      work_steps         JSONB NOT NULL DEFAULT '[]',
      crew               JSONB NOT NULL DEFAULT '[]',
      submitted_at         TIMESTAMP,
      approved_by_user_id  UUID REFERENCES users(id),
      approved_at          TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS jsa_forms_project_id_idx ON jsa_forms(project_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_by_user_id UUID NOT NULL REFERENCES users(id),
      log_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'IN_PROGRESS'
        CHECK (status IN ('IN_PROGRESS','COMPILED')),
      entries         JSONB NOT NULL DEFAULT '[]',
      weather         TEXT,
      manpower_count  INT,
      manpower_detail TEXT,
      narrative       TEXT,
      tomorrow_checklist JSONB NOT NULL DEFAULT '[]',
      compiled_at TIMESTAMP,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(project_id, created_by_user_id, log_date)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS daily_logs_project_id_idx ON daily_logs(project_id)
  `);
})().catch((e) => {
  console.error("Startup error:", e);
  process.exit(1);
});

/* HEALTH */

app.get("/", (_req, res) => {
  res.send("GC Suite API running");
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/* AUTH */

app.post("/auth/dev-login", async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email) return apiError(res, 400, "email required");

    const { rows } = await pool.query(
      `SELECT id, email, name
       FROM users
       WHERE lower(email) = lower($1)`,
      [email]
    );

    const user = rows[0];
    if (!user) return apiError(res, 404, "User not found");

    const token = signSessionToken(user.id);

    res.json({ token, user });
  } catch (e) {
    console.error(e);
    return apiError(res, 500, "Server error");
  }
});

/* PROJECTS */

app.get("/projects", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.location, pm.role
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = $1
       ORDER BY p.name`,
      [req.userId]
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    return apiError(res, 500, "Server error");
  }
});

app.get("/projects/:projectId/me", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    const membership = await getProjectMembership(projectId, req.userId);

    if (!membership) {
      return apiError(res, 403, "Not in project");
    }

    res.json(membership);
  } catch (e) {
    console.error(e);
    return apiError(res, 500, "Server error");
  }
});

app.get("/projects/:projectId/companies", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    await requireProjectMember(projectId, req.userId);

    const { rows } = await pool.query(
      `SELECT DISTINCT c.id, c.name, c.type
       FROM companies c
       JOIN project_members pm ON pm.company_id = c.id
       WHERE pm.project_id = $1
       ORDER BY c.name`,
      [projectId]
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

/* ACTIVITY */

app.get("/projects/:projectId/activity", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    await requireProjectMember(projectId, req.userId);

    const { rows } = await pool.query(
      `SELECT *
       FROM project_activity
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [projectId]
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

/* PUNCH / FIELD ISSUES */

app.get("/projects/:projectId/punch", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const membership = await requireProjectMember(projectId, req.userId);

    let result;

    if (isGcRole(membership.role)) {
      result = await pool.query(
        `SELECT
           i.*,
           COALESCE(NULLIF(u.name, ''), u.email, 'User') AS created_by_name,
           c.name AS assigned_company_name,
           COALESCE(COUNT(pp.id), 0) AS photo_count,
           (
             SELECT pp2.file_path
             FROM punch_photos pp2
             WHERE pp2.punch_id = i.id
             ORDER BY pp2.created_at DESC
             LIMIT 1
           ) AS latest_photo_path
         FROM issues i
         LEFT JOIN users u ON u.id = i.created_by_user_id
         LEFT JOIN companies c ON c.id = i.assigned_company_id
         LEFT JOIN punch_photos pp ON pp.punch_id = i.id
         WHERE i.project_id = $1
         GROUP BY i.id, u.name, u.email, c.name
         ORDER BY i.created_at DESC`,
        [projectId]
      );
    } else {
      result = await pool.query(
        `SELECT
           i.*,
           COALESCE(NULLIF(u.name, ''), u.email, 'User') AS created_by_name,
           c.name AS assigned_company_name,
           COALESCE(COUNT(pp.id), 0) AS photo_count,
           (
             SELECT pp2.file_path
             FROM punch_photos pp2
             WHERE pp2.punch_id = i.id
             ORDER BY pp2.created_at DESC
             LIMIT 1
           ) AS latest_photo_path
         FROM issues i
         LEFT JOIN users u ON u.id = i.created_by_user_id
         LEFT JOIN companies c ON c.id = i.assigned_company_id
         LEFT JOIN punch_photos pp ON pp.punch_id = i.id
         WHERE i.project_id = $1
           AND i.assigned_company_id = $2
         GROUP BY i.id, u.name, u.email, c.name
         ORDER BY i.created_at DESC`,
        [projectId, membership.company_id]
      );
    }

    res.json(result.rows);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

app.post("/projects/:projectId/punch", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title, trade, location, assigned_company_id, due_date } = req.body || {};

    await requireGcMembership(projectId, req.userId);

    const cleanTitle = String(title || "").trim();
    if (!cleanTitle) {
      return apiError(res, 400, "title required");
    }

    const dueDate = normalizeDateInput(due_date);
    const userName = await getUserDisplayName(req.userId);

    const { rows } = await pool.query(
      `INSERT INTO issues
       (
         project_id,
         title,
         location,
         trade,
         status,
         created_by_user_id,
         assigned_company_id,
         due_date
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        projectId,
        cleanTitle,
        location || null,
        trade || null,
        "OPEN",
        req.userId,
        assigned_company_id || null,
        dueDate,
      ]
    );

    const issue = rows[0];

    await logActivity(projectId, userName, "created", "Issue", issue.title);

    res.status(201).json(issue);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

app.post("/punch/:issueId/start", requireAuth, async (req, res) => {
  try {
    const { issueId } = req.params;
    if (!isUuid(issueId)) return apiError(res, 400, "Invalid issueId");

    const issue = await getIssue(issueId);
    if (!issue) return apiError(res, 404, "Issue not found");

    const membership = await requireProjectMember(issue.project_id, req.userId);
    const access = requireIssueAccess(membership, issue);

    if (!access.ok) return apiError(res, access.status, access.error);

    const current = normalizePunchStatus(issue.status);

    if (current === "IN_PROGRESS") {
      const { rows } = await pool.query(`SELECT * FROM issues WHERE id = $1`, [issueId]);
      return res.json(rows[0]);
    }

    if (current !== "OPEN") {
      return apiError(res, 409, "Invalid state for start", {
        currentStatus: issue.status,
      });
    }

    const { rows } = await pool.query(
      `UPDATE issues
       SET status = 'IN_PROGRESS'
       WHERE id = $1
       RETURNING *`,
      [issueId]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

app.post("/punch/:issueId/complete", requireAuth, async (req, res) => {
  try {
    const { issueId } = req.params;
    if (!isUuid(issueId)) return apiError(res, 400, "Invalid issueId");

    const issue = await getIssue(issueId);
    if (!issue) return apiError(res, 404, "Issue not found");

    const membership = await requireProjectMember(issue.project_id, req.userId);
    const access = requireIssueAccess(membership, issue);

    if (!access.ok) return apiError(res, access.status, access.error);

    const current = normalizePunchStatus(issue.status);

    if (current === "DONE") {
      const { rows } = await pool.query(`SELECT * FROM issues WHERE id = $1`, [issueId]);
      return res.json(rows[0]);
    }

    if (current !== "OPEN" && current !== "IN_PROGRESS") {
      return apiError(res, 409, "Invalid state for complete", {
        currentStatus: issue.status,
      });
    }

    const { rows } = await pool.query(
      `UPDATE issues
       SET status = 'DONE'
       WHERE id = $1
       RETURNING *`,
      [issueId]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

app.post("/punch/:issueId/verify", requireAuth, async (req, res) => {
  try {
    const { issueId } = req.params;
    if (!isUuid(issueId)) return apiError(res, 400, "Invalid issueId");

    const issue = await getIssue(issueId);
    if (!issue) return apiError(res, 404, "Issue not found");

    await requireGcMembership(issue.project_id, req.userId);

    const current = normalizePunchStatus(issue.status);

    if (current === "VERIFIED") {
      const { rows } = await pool.query(`SELECT * FROM issues WHERE id = $1`, [issueId]);
      return res.json(rows[0]);
    }

    if (current !== "DONE") {
      return apiError(res, 409, "Item must be DONE before it can be VERIFIED", {
        currentStatus: issue.status,
      });
    }

    const { rows } = await pool.query(
      `UPDATE issues
       SET status = 'VERIFIED'
       WHERE id = $1
       RETURNING *`,
      [issueId]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

app.post("/punch/:issueId/close", requireAuth, async (req, res) => {
  try {
    const { issueId } = req.params;
    if (!isUuid(issueId)) return apiError(res, 400, "Invalid issueId");

    const issue = await getIssue(issueId);
    if (!issue) return apiError(res, 404, "Issue not found");

    await requireGcMembership(issue.project_id, req.userId);

    const current = normalizePunchStatus(issue.status);

    if (current === "CLOSED") {
      const { rows } = await pool.query(`SELECT * FROM issues WHERE id = $1`, [issueId]);
      return res.json(rows[0]);
    }

    if (current !== "VERIFIED") {
      return apiError(res, 409, "Item must be VERIFIED before it can be CLOSED", {
        currentStatus: issue.status,
      });
    }

    const { rows } = await pool.query(
      `UPDATE issues
       SET status = 'CLOSED'
       WHERE id = $1
       RETURNING *`,
      [issueId]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

app.delete("/punch/:issueId", requireAuth, async (req, res) => {
  try {
    const { issueId } = req.params;
    if (!isUuid(issueId)) return apiError(res, 400, "Invalid issueId");

    const issue = await getIssue(issueId);
    if (!issue) return apiError(res, 404, "Issue not found");

    await requireGcMembership(issue.project_id, req.userId);

    await pool.query(`DELETE FROM punch_photos WHERE punch_id = $1`, [issueId]);
    await pool.query(`DELETE FROM issues WHERE id = $1`, [issueId]);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

/* PHOTO UPLOAD */

const upload = multer({
  dest: UPLOAD_ROOT,
  limits: { fileSize: 15 * 1024 * 1024 },
});

app.post("/punch/:issueId/photo", requireAuth, upload.single("photo"), async (req, res) => {
  try {
    const { issueId } = req.params;
    if (!isUuid(issueId)) return apiError(res, 400, "Invalid issueId");

    if (!req.file) {
      return apiError(res, 400, "No photo uploaded");
    }

    const issue = await getIssue(issueId);
    if (!issue) return apiError(res, 404, "Issue not found");

    const membership = await requireProjectMember(issue.project_id, req.userId);
    const access = requireIssueAccess(membership, issue);

    if (!access.ok) return apiError(res, access.status, access.error);

    const filePath = `/uploads/${req.file.filename}`;

    const { rows } = await pool.query(
      `INSERT INTO punch_photos
       (punch_id, file_path, original_name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [issueId, filePath, req.file.originalname]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    return apiError(res, 500, "Photo upload failed");
  }
});

app.get("/punch/:issueId/photos", requireAuth, async (req, res) => {
  try {
    const { issueId } = req.params;
    if (!isUuid(issueId)) return apiError(res, 400, "Invalid issueId");

    const issue = await getIssue(issueId);
    if (!issue) return apiError(res, 404, "Issue not found");

    const membership = await requireProjectMember(issue.project_id, req.userId);
    const access = requireIssueAccess(membership, issue);

    if (!access.ok) return apiError(res, access.status, access.error);

    const { rows } = await pool.query(
      `SELECT *
       FROM punch_photos
       WHERE punch_id = $1
       ORDER BY created_at DESC`,
      [issueId]
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

/* SCHEDULE */

app.get("/projects/:projectId/schedule", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    await requireProjectMember(projectId, req.userId);

    const { rows } = await pool.query(
      `SELECT
         id,
         project_id,
         title,
         date,
         start_at,
         end_at,
         due_date,
         notes,
         status,
         created_by_user_id,
         created_at
       FROM schedule_items
       WHERE project_id = $1
       ORDER BY COALESCE(start_at, date, due_date) NULLS LAST, created_at DESC`,
      [projectId]
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

app.post("/projects/:projectId/schedule", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title, date, start_at, end_at, due_date, notes } = req.body || {};

    await requireGcMembership(projectId, req.userId);

    const cleanTitle = String(title || "").trim();
    if (!cleanTitle) {
      return apiError(res, 400, "title required");
    }

    const normalizedDate = normalizeDateInput(date || start_at || due_date);
    const normalizedStartAt = normalizeDateInput(start_at || date || due_date);
    const normalizedEndAt = normalizeDateInput(end_at);
    const normalizedDueDate = normalizeDateInput(due_date);
    const userName = await getUserDisplayName(req.userId);

    const { rows } = await pool.query(
      `INSERT INTO schedule_items
       (
         project_id,
         title,
         date,
         start_at,
         end_at,
         due_date,
         notes,
         status,
         created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING
         id,
         project_id,
         title,
         date,
         start_at,
         end_at,
         due_date,
         notes,
         status,
         created_by_user_id,
         created_at`,
      [
        projectId,
        cleanTitle,
        normalizedDate,
        normalizedStartAt,
        normalizedEndAt,
        normalizedDueDate,
        notes || null,
        "OPEN",
        req.userId,
      ]
    );

    const item = rows[0];

    await logActivity(projectId, userName, "created", "Schedule", item.title);

    res.status(201).json(item);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

app.post("/schedule-item/:id/done", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");

    const item = await getScheduleItem(id);
    if (!item) return apiError(res, 404, "Schedule item not found");

    await requireGcMembership(item.project_id, req.userId);

    const { rows } = await pool.query(
      `UPDATE schedule_items
       SET status = 'DONE'
       WHERE id = $1
       RETURNING
         id,
         project_id,
         title,
         date,
         start_at,
         end_at,
         due_date,
         notes,
         status,
         created_by_user_id,
         created_at`,
      [id]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

app.post("/schedule-item/:id/verify", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");

    const item = await getScheduleItem(id);
    if (!item) return apiError(res, 404, "Schedule item not found");

    await requireGcMembership(item.project_id, req.userId);

    const current = normalizeScheduleStatus(item.status);
    if (current !== "DONE" && current !== "VERIFIED") {
      return apiError(res, 409, "Item must be DONE before it can be VERIFIED", {
        currentStatus: item.status,
      });
    }

    const { rows } = await pool.query(
      `UPDATE schedule_items
       SET status = 'VERIFIED'
       WHERE id = $1
       RETURNING
         id,
         project_id,
         title,
         date,
         start_at,
         end_at,
         due_date,
         notes,
         status,
         created_by_user_id,
         created_at`,
      [id]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

app.post("/schedule-item/:id/cancel", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");

    const item = await getScheduleItem(id);
    if (!item) return apiError(res, 404, "Schedule item not found");

    await requireGcMembership(item.project_id, req.userId);

    const { rows } = await pool.query(
      `UPDATE schedule_items
       SET status = 'CANCELED'
       WHERE id = $1
       RETURNING
         id,
         project_id,
         title,
         date,
         start_at,
         end_at,
         due_date,
         notes,
         status,
         created_by_user_id,
         created_at`,
      [id]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

app.delete("/schedule-item/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");

    const item = await getScheduleItem(id);
    if (!item) return apiError(res, 404, "Schedule item not found");

    await requireGcMembership(item.project_id, req.userId);

    await pool.query(`DELETE FROM schedule_items WHERE id = $1`, [id]);

    res.json({ ok: true, deleted: id });
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   DAILY LOG
───────────────────────────────────────────────────────────────────────────── */

async function getDailyLog(logId) {
  const { rows } = await pool.query(
    `SELECT * FROM daily_logs WHERE id = $1`,
    [logId]
  );
  return rows[0] || null;
}

// Get or create today's log for the current user
app.get("/projects/:projectId/daily-log/today", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");

    await requireProjectMember(projectId, req.userId);

    const today = new Date().toISOString().slice(0, 10);

    let { rows } = await pool.query(
      `SELECT * FROM daily_logs
       WHERE project_id = $1 AND created_by_user_id = $2 AND log_date = $3`,
      [projectId, req.userId, today]
    );

    if (rows.length === 0) {
      const result = await pool.query(
        `INSERT INTO daily_logs (project_id, created_by_user_id, log_date)
         VALUES ($1, $2, $3) RETURNING *`,
        [projectId, req.userId, today]
      );
      rows = result.rows;
    }

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

// List past logs for a project (all team members)
app.get("/projects/:projectId/daily-logs", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");

    await requireProjectMember(projectId, req.userId);

    const { rows } = await pool.query(
      `SELECT d.id, d.log_date, d.status, d.weather, d.manpower_count,
              d.compiled_at, d.created_at, u.name AS created_by_name
       FROM daily_logs d
       LEFT JOIN users u ON u.id = d.created_by_user_id
       WHERE d.project_id = $1
       ORDER BY d.log_date DESC, d.created_at DESC
       LIMIT 60`,
      [projectId]
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

// Update entries / summary fields on a log
app.put("/daily-log/:logId", requireAuth, async (req, res) => {
  try {
    const { logId } = req.params;
    if (!isUuid(logId)) return apiError(res, 400, "Invalid logId");

    const log = await getDailyLog(logId);
    if (!log) return apiError(res, 404, "Log not found");

    await requireProjectMember(log.project_id, req.userId);

    if (log.created_by_user_id !== req.userId)
      return apiError(res, 403, "Can only edit your own log");
    if (log.status === "COMPILED")
      return apiError(res, 409, "Log already compiled");

    const { entries, weather, manpower_count, manpower_detail, narrative } =
      req.body || {};

    const { rows } = await pool.query(
      `UPDATE daily_logs SET
         entries         = COALESCE($2::jsonb, entries),
         weather         = COALESCE($3,        weather),
         manpower_count  = COALESCE($4,        manpower_count),
         manpower_detail = COALESCE($5,        manpower_detail),
         narrative       = COALESCE($6,        narrative)
       WHERE id = $1 RETURNING *`,
      [
        logId,
        entries        != null ? JSON.stringify(entries)  : null,
        weather        ?? null,
        manpower_count ?? null,
        manpower_detail ?? null,
        narrative      ?? null,
      ]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

// Upload a photo and append it as an entry
app.post(
  "/daily-log/:logId/photo",
  requireAuth,
  upload.single("photo"),
  async (req, res) => {
    try {
      const { logId } = req.params;
      if (!isUuid(logId)) return apiError(res, 400, "Invalid logId");

      const log = await getDailyLog(logId);
      if (!log) return apiError(res, 404, "Log not found");

      await requireProjectMember(log.project_id, req.userId);

      if (log.created_by_user_id !== req.userId)
        return apiError(res, 403, "Can only add to your own log");
      if (!req.file) return apiError(res, 400, "No photo uploaded");

      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes()
      ).padStart(2, "0")}`;

      const newEntry = {
        id:            randomUUID(),
        type:          "photo",
        file_path:     req.file.path,
        original_name: req.file.originalname,
        mime_type:     req.file.mimetype,
        size_bytes:    req.file.size,
        caption:       req.body?.caption || "",
        time,
        created_at:    now.toISOString(),
      };

      const currentEntries = Array.isArray(log.entries) ? log.entries : [];
      const updatedEntries  = [...currentEntries, newEntry];

      const { rows } = await pool.query(
        `UPDATE daily_logs SET entries = $2::jsonb WHERE id = $1 RETURNING *`,
        [logId, JSON.stringify(updatedEntries)]
      );

      res.json({ log: rows[0], entry: newEntry });
    } catch (e) {
      console.error(e);
      return handleThrownAccessError(res, e);
    }
  }
);

// Compile the day — creates issues + schedule items, locks the log
app.post("/daily-log/:logId/compile", requireAuth, async (req, res) => {
  try {
    const { logId } = req.params;
    if (!isUuid(logId)) return apiError(res, 400, "Invalid logId");

    const log = await getDailyLog(logId);
    if (!log) return apiError(res, 404, "Log not found");

    await requireProjectMember(log.project_id, req.userId);

    if (log.created_by_user_id !== req.userId)
      return apiError(res, 403, "Can only compile your own log");
    if (log.status === "COMPILED")
      return apiError(res, 409, "Log already compiled");

    const {
      weather,
      manpower_count,
      manpower_detail,
      narrative,
      tomorrow_checklist = [],
      create_issues      = [],
      create_schedule_items = [],
    } = req.body || {};

    const userName       = await getUserDisplayName(req.userId);
    const createdIssues  = [];
    const createdItems   = [];

    for (const issue of create_issues) {
      if (!issue.title) continue;
      const { rows } = await pool.query(
        `INSERT INTO issues
           (project_id, title, location, trade, status, created_by_user_id)
         VALUES ($1,$2,$3,$4,'OPEN',$5) RETURNING id, title`,
        [
          log.project_id,
          issue.title,
          issue.location || "General",
          issue.trade    || "General",
          req.userId,
        ]
      );
      createdIssues.push(rows[0]);
      await logActivity(log.project_id, userName, "created", "Issue", rows[0].title);
    }

    for (const item of create_schedule_items) {
      if (!item.title) continue;
      const { rows } = await pool.query(
        `INSERT INTO schedule_items
           (project_id, title, due_date, notes, status, created_by_user_id)
         VALUES ($1,$2,$3,$4,'OPEN',$5) RETURNING id, title`,
        [
          log.project_id,
          item.title,
          normalizeDateInput(item.due_date),
          item.notes || null,
          req.userId,
        ]
      );
      createdItems.push(rows[0]);
      await logActivity(log.project_id, userName, "created", "Schedule Item", rows[0].title);
    }

    const { rows } = await pool.query(
      `UPDATE daily_logs SET
         status             = 'COMPILED',
         compiled_at        = NOW(),
         weather            = COALESCE($2, weather),
         manpower_count     = COALESCE($3, manpower_count),
         manpower_detail    = COALESCE($4, manpower_detail),
         narrative          = COALESCE($5, narrative),
         tomorrow_checklist = $6::jsonb
       WHERE id = $1 RETURNING *`,
      [
        logId,
        weather         ?? null,
        manpower_count  ?? null,
        manpower_detail ?? null,
        narrative       ?? null,
        JSON.stringify(tomorrow_checklist),
      ]
    );

    await logActivity(
      log.project_id,
      userName,
      "compiled",
      "Daily Log",
      `Daily Log ${log.log_date}`
    );

    res.json({
      log:                    rows[0],
      created_issues:         createdIssues,
      created_schedule_items: createdItems,
    });
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   JSA / FORMS
───────────────────────────────────────────────────────────────────────────── */

async function getJsaForm(id) {
  const { rows } = await pool.query(`SELECT * FROM jsa_forms WHERE id = $1`, [id]);
  return rows[0] || null;
}

// List all JSA forms for a project
app.get("/projects/:projectId/jsa", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");

    await requireProjectMember(projectId, req.userId);

    const { rows } = await pool.query(
      `SELECT j.*, u.name AS created_by_name
       FROM jsa_forms j
       LEFT JOIN users u ON u.id = j.created_by_user_id
       WHERE j.project_id = $1
       ORDER BY j.created_at DESC`,
      [projectId]
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

// Create a new JSA form
app.post("/projects/:projectId/jsa", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");

    await requireProjectMember(projectId, req.userId);

    const {
      work_description,
      work_location,
      jsa_date,
      superintendent_name,
      emergency_contacts = {},
      hazards = [],
      ppe = [],
      work_steps = [],
      crew = [],
    } = req.body || {};

    const userName = await getUserDisplayName(req.userId);

    const { rows } = await pool.query(
      `INSERT INTO jsa_forms (
         project_id, created_by_user_id,
         work_description, work_location, jsa_date, superintendent_name,
         emergency_contacts, hazards, ppe, work_steps, crew
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        projectId,
        req.userId,
        work_description || null,
        work_location || null,
        normalizeDateInput(jsa_date),
        superintendent_name || null,
        JSON.stringify(emergency_contacts),
        JSON.stringify(hazards),
        JSON.stringify(ppe),
        JSON.stringify(work_steps),
        JSON.stringify(crew),
      ]
    );

    await logActivity(
      projectId,
      userName,
      "created",
      "JSA",
      rows[0].work_description || "Job Safety Analysis"
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

// Get a single JSA form
app.get("/jsa/:jsaId", requireAuth, async (req, res) => {
  try {
    const { jsaId } = req.params;
    if (!isUuid(jsaId)) return apiError(res, 400, "Invalid jsaId");

    const jsa = await getJsaForm(jsaId);
    if (!jsa) return apiError(res, 404, "JSA not found");

    await requireProjectMember(jsa.project_id, req.userId);

    res.json(jsa);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

// Update a JSA form (DRAFT or SUBMITTED only)
app.put("/jsa/:jsaId", requireAuth, async (req, res) => {
  try {
    const { jsaId } = req.params;
    if (!isUuid(jsaId)) return apiError(res, 400, "Invalid jsaId");

    const jsa = await getJsaForm(jsaId);
    if (!jsa) return apiError(res, 404, "JSA not found");

    await requireProjectMember(jsa.project_id, req.userId);

    if (jsa.status === "APPROVED") {
      return apiError(res, 409, "Cannot edit an approved JSA");
    }

    const {
      work_description,
      work_location,
      jsa_date,
      superintendent_name,
      emergency_contacts,
      hazards,
      ppe,
      work_steps,
      crew,
    } = req.body || {};

    const { rows } = await pool.query(
      `UPDATE jsa_forms SET
         work_description    = COALESCE($2,            work_description),
         work_location       = COALESCE($3,            work_location),
         jsa_date            = COALESCE($4,            jsa_date),
         superintendent_name = COALESCE($5,            superintendent_name),
         emergency_contacts  = COALESCE($6::jsonb,     emergency_contacts),
         hazards             = COALESCE($7::jsonb,     hazards),
         ppe                 = COALESCE($8::jsonb,     ppe),
         work_steps          = COALESCE($9::jsonb,     work_steps),
         crew                = COALESCE($10::jsonb,    crew)
       WHERE id = $1
       RETURNING *`,
      [
        jsaId,
        work_description ?? null,
        work_location ?? null,
        normalizeDateInput(jsa_date),
        superintendent_name ?? null,
        emergency_contacts != null ? JSON.stringify(emergency_contacts) : null,
        hazards     != null ? JSON.stringify(hazards)     : null,
        ppe         != null ? JSON.stringify(ppe)         : null,
        work_steps  != null ? JSON.stringify(work_steps)  : null,
        crew        != null ? JSON.stringify(crew)        : null,
      ]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

// Submit a JSA form for review
app.post("/jsa/:jsaId/submit", requireAuth, async (req, res) => {
  try {
    const { jsaId } = req.params;
    if (!isUuid(jsaId)) return apiError(res, 400, "Invalid jsaId");

    const jsa = await getJsaForm(jsaId);
    if (!jsa) return apiError(res, 404, "JSA not found");

    await requireProjectMember(jsa.project_id, req.userId);

    if (jsa.status !== "DRAFT") {
      return apiError(res, 409, "Only DRAFT forms can be submitted", {
        currentStatus: jsa.status,
      });
    }

    const userName = await getUserDisplayName(req.userId);

    const { rows } = await pool.query(
      `UPDATE jsa_forms
       SET status = 'SUBMITTED', submitted_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [jsaId]
    );

    await logActivity(
      jsa.project_id,
      userName,
      "submitted",
      "JSA",
      jsa.work_description || "Job Safety Analysis"
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

// Approve a JSA form (GC only)
app.post("/jsa/:jsaId/approve", requireAuth, async (req, res) => {
  try {
    const { jsaId } = req.params;
    if (!isUuid(jsaId)) return apiError(res, 400, "Invalid jsaId");

    const jsa = await getJsaForm(jsaId);
    if (!jsa) return apiError(res, 404, "JSA not found");

    await requireGcMembership(jsa.project_id, req.userId);

    if (jsa.status !== "SUBMITTED") {
      return apiError(res, 409, "Only SUBMITTED forms can be approved", {
        currentStatus: jsa.status,
      });
    }

    const userName = await getUserDisplayName(req.userId);

    const { rows } = await pool.query(
      `UPDATE jsa_forms
       SET status = 'APPROVED', approved_by_user_id = $2, approved_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [jsaId, req.userId]
    );

    await logActivity(
      jsa.project_id,
      userName,
      "approved",
      "JSA",
      jsa.work_description || "Job Safety Analysis"
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

// Reject a JSA form (GC only)
app.post("/jsa/:jsaId/reject", requireAuth, async (req, res) => {
  try {
    const { jsaId } = req.params;
    if (!isUuid(jsaId)) return apiError(res, 400, "Invalid jsaId");

    const jsa = await getJsaForm(jsaId);
    if (!jsa) return apiError(res, 404, "JSA not found");

    await requireGcMembership(jsa.project_id, req.userId);

    if (jsa.status !== "SUBMITTED") {
      return apiError(res, 409, "Only SUBMITTED forms can be rejected", {
        currentStatus: jsa.status,
      });
    }

    const userName = await getUserDisplayName(req.userId);

    const { rows } = await pool.query(
      `UPDATE jsa_forms SET status = 'REJECTED' WHERE id = $1 RETURNING *`,
      [jsaId]
    );

    await logActivity(
      jsa.project_id,
      userName,
      "rejected",
      "JSA",
      jsa.work_description || "Job Safety Analysis"
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

// Delete a JSA form (non-approved only)
app.delete("/jsa/:jsaId", requireAuth, async (req, res) => {
  try {
    const { jsaId } = req.params;
    if (!isUuid(jsaId)) return apiError(res, 400, "Invalid jsaId");

    const jsa = await getJsaForm(jsaId);
    if (!jsa) return apiError(res, 404, "JSA not found");

    await requireProjectMember(jsa.project_id, req.userId);

    if (jsa.status === "APPROVED") {
      return apiError(res, 409, "Cannot delete an approved JSA");
    }

    const userName = await getUserDisplayName(req.userId);

    await pool.query(`DELETE FROM jsa_forms WHERE id = $1`, [jsaId]);

    await logActivity(
      jsa.project_id,
      userName,
      "deleted",
      "JSA",
      jsa.work_description || "Job Safety Analysis"
    );

    res.json({ ok: true, deleted: jsaId });
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

/* PLANS */

app.get("/projects/:projectId/plans", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");

    await requireProjectMember(projectId, req.userId);

    const store = await readPlans(projectId);
    const sheets = filterSheets(store, req.query);
    res.json({ sheets });
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

app.post("/projects/:projectId/plans", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");

    const membership = await requireProjectMember(projectId, req.userId);
    if (!isGcRole(membership.role)) {
      return apiError(res, 403, "Only GC users can upload plans");
    }

    const store = await readPlans(projectId);
    const updated = upsertSheetAndRevision(store, req.body);
    await writePlans(projectId, updated);

    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    if (e.status === 400) return apiError(res, 400, e.message);
    return handleThrownAccessError(res, e);
  }
});

app.post("/projects/:projectId/plans/:sheetId/approve", requireAuth, async (req, res) => {
  try {
    const { projectId, sheetId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");

    const membership = await requireProjectMember(projectId, req.userId);
    if (!isGcRole(membership.role)) {
      return apiError(res, 403, "Only GC users can approve plans");
    }

    const { rev } = req.body;
    if (rev === undefined) return apiError(res, 400, "rev is required");

    const store = await readPlans(projectId);
    const updated = approveRevision(store, sheetId, rev);
    await writePlans(projectId, updated);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    if (e.status === 404) return apiError(res, 404, e.message);
    return handleThrownAccessError(res, e);
  }
});

app.post("/projects/:projectId/plans/:sheetId/supersede", requireAuth, async (req, res) => {
  try {
    const { projectId, sheetId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");

    const membership = await requireProjectMember(projectId, req.userId);
    if (!isGcRole(membership.role)) {
      return apiError(res, 403, "Only GC users can manage plans");
    }

    const { rev } = req.body;
    if (rev === undefined) return apiError(res, 400, "rev is required");

    const store = await readPlans(projectId);
    const updated = supersedeRevision(store, sheetId, rev);
    await writePlans(projectId, updated);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    if (e.status === 404) return apiError(res, 404, e.message);
    return handleThrownAccessError(res, e);
  }
});

app.post(
  "/projects/:projectId/plans/upload",
  requireAuth,
  upload.single("pdf"),
  async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");

      const membership = await requireProjectMember(projectId, req.userId);
      if (!isGcRole(membership.role)) {
        return apiError(res, 403, "Only GC users can upload plans");
      }

      if (!req.file) {
        return apiError(res, 400, "No PDF uploaded");
      }

      const { sheetNo, sheetId: rawSheetId, title, discipline, makeCurrent, rev, revDate } =
        req.body;

      if (!sheetNo || !title || !discipline) {
        return apiError(res, 400, "sheetNo, title, and discipline are required");
      }

      // rename uploaded file to .pdf
      const ext = ".pdf";
      const newFilename = `${req.file.filename}${ext}`;
      const oldPath = req.file.path;
      const newPath = path.join(UPLOAD_ROOT, newFilename);
      await fs.rename(oldPath, newPath);

      const fileUrl = `/uploads/${newFilename}`;
      const sheetId = rawSheetId?.trim() || sheetNo.trim();
      const status = makeCurrent === "true" ? "CURRENT" : "PENDING";

      const store = await readPlans(projectId);
      const updated = upsertSheetAndRevision(store, {
        sheetId,
        sheetNo: sheetNo.trim(),
        title: title.trim(),
        discipline: discipline.trim(),
        rev: rev?.trim() || "1",
        revDate: revDate?.trim() || new Date().toISOString().slice(0, 10),
        fileUrl,
        status,
      });
      await writePlans(projectId, updated);

      res.json({ ok: true, sheet: { sheetId, sheetNo, title, discipline, fileUrl } });
    } catch (e) {
      console.error(e);
      if (e.status === 400) return apiError(res, 400, e.message);
      return handleThrownAccessError(res, e);
    }
  }
);

/* ERROR HANDLER */

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Server error" });
});

/* SERVER */

const server = app.listen(PORT, HOST, () => {
  console.log(`GC Suite API running on port ${PORT}`);
});

/* SHUTDOWN */

async function shutdown() {
  console.log("Shutting down...");

  server.close(async () => {
    try {
      await pool.end();
    } catch (e) {
      console.error("Pool shutdown error:", e);
    }
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);