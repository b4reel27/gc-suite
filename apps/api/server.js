import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
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

import webpush from "web-push";
import nodemailer from "nodemailer";

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

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : true; // dev: allow all; set ALLOWED_ORIGINS=https://gc-suite.vercel.app in prod
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOAD_ROOT));

/* RATE LIMITING */

const loginAttempts = new Map(); // ip -> { count, resetAt }
function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (entry && entry.resetAt > now) {
    if (entry.count >= 10) return false;
    entry.count++;
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  }
  return true;
}

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

/* PUSH NOTIFICATIONS */

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — push notifications disabled");
}
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails("mailto:admin@gc-suite.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/* EMAIL */

let mailer = null;
if (process.env.SMTP_HOST) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendEmail(to, subject, text) {
  if (!mailer || !to) return;
  try {
    await mailer.sendMail({ from: process.env.SMTP_FROM || "noreply@gc-suite.app", to, subject, text });
  } catch (e) {
    console.error("Email send error:", e.message);
  }
}

async function notifyCompanyMembers(projectId, companyId, subject, text) {
  if (!mailer || !companyId) return;
  try {
    const { rows } = await pool.query(
      `SELECT u.email FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1 AND pm.company_id = $2`,
      [projectId, companyId]
    );
    for (const row of rows) await sendEmail(row.email, subject, text);
  } catch (e) {
    console.error("notifyCompanyMembers:", e.message);
  }
}

async function sendPushToUser(userId, title, body, url = "/dashboard") {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  try {
    const { rows } = await pool.query(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`, [userId]
    );
    for (const sub of rows) {
      const payload = JSON.stringify({ title, body, url });
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
        .catch(async (err) => {
          if (err.statusCode === 410) {
            await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [sub.endpoint]).catch(() => {});
          }
        });
    }
  } catch (e) {
    console.error("sendPush error:", e);
  }
}

/* STARTUP */

(async () => {
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });

  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  // Add password_hash to users if not present
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  // Add created_at to projects if not present
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);
  // Ensure project_members unique constraint exists for upsert
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_user_idx ON project_members(project_id, user_id)`).catch(() => {});
  // Ensure project_members has company_id
  await pool.query(`ALTER TABLE project_members ADD COLUMN IF NOT EXISTS company_id UUID`).catch(() => {});

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

  // Plan pins on issues
  await pool.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS plan_sheet_id TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS pin_x FLOAT`).catch(() => {});
  await pool.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS pin_y FLOAT`).catch(() => {});

  // RFIs — create minimal table then add columns so a stale partial schema gets patched
  await pool.query(`CREATE SEQUENCE IF NOT EXISTS rfis_rfi_number_seq`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS rfis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE
  )`).catch((e) => console.error("rfis table:", e.message));
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS rfi_number INTEGER DEFAULT nextval('rfis_rfi_number_seq')`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id)`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS title TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS question TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS to_name TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS due_date DATE`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'OPEN'`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS response TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS responded_by_user_id UUID REFERENCES users(id)`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`).catch(() => {});
  await pool.query(`ALTER SEQUENCE IF EXISTS rfis_rfi_number_seq OWNED BY rfis.rfi_number`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS rfis_project_id_idx ON rfis(project_id)`).catch(() => {});

  // Push subscriptions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, endpoint)
    )
  `).catch((e) => console.error("push_subscriptions table:", e.message));

  // Generic form submissions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS form_submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_by_user_id UUID NOT NULL REFERENCES users(id),
      form_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED')),
      data JSONB NOT NULL DEFAULT '{}',
      submitted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch((e) => console.error("form_submissions table:", e.message));
  await pool.query(`CREATE INDEX IF NOT EXISTS form_submissions_project_id_idx ON form_submissions(project_id)`).catch(() => {});

  // Submittal log
  await pool.query(`
    CREATE TABLE IF NOT EXISTS submittals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_by_user_id UUID NOT NULL REFERENCES users(id),
      spec_section TEXT,
      title TEXT NOT NULL,
      submittal_type TEXT NOT NULL DEFAULT 'Shop Drawing'
        CHECK (submittal_type IN ('Shop Drawing','Sample','Product Data','O&M Manual','Other')),
      submitted_by TEXT,
      submitted_date DATE,
      status TEXT NOT NULL DEFAULT 'Required'
        CHECK (status IN ('Required','Submitted','Under Review','Approved','Rejected')),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch((e) => console.error("submittals table:", e.message));
  await pool.query(`CREATE INDEX IF NOT EXISTS submittals_project_id_idx ON submittals(project_id)`).catch(() => {});

  // RFI attachments
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rfi_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rfi_id UUID NOT NULL REFERENCES rfis(id) ON DELETE CASCADE,
      file_url TEXT NOT NULL,
      original_name TEXT,
      uploaded_by_user_id UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch((e) => console.error("rfi_attachments table:", e.message));

  // Submittal attachments
  await pool.query(`
    CREATE TABLE IF NOT EXISTS submittal_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submittal_id UUID NOT NULL REFERENCES submittals(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT,
      uploaded_by_user_id UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch((e) => console.error("submittal_attachments table:", e.message));

  // Plan annotations (markup drawn on top of a plan sheet)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plan_annotations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      sheet_id TEXT NOT NULL,
      rev TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL,
      created_by_user_id UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch((e) => console.error("plan_annotations table:", e.message));
  await pool.query(`CREATE INDEX IF NOT EXISTS plan_annotations_sheet_idx ON plan_annotations(project_id, sheet_id)`).catch(() => {});

  // Drop the unique-per-day constraint so users can file a log and start a fresh
  // one on the same calendar date (the /today endpoint already filters by status).
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE daily_logs
        DROP CONSTRAINT IF EXISTS daily_logs_project_id_created_by_user_id_log_date_key;
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$;
  `).catch(() => {});

  // Performance indexes on core tables (safe if they already exist)
  await pool.query(`CREATE INDEX IF NOT EXISTS issues_project_id_idx ON issues(project_id)`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS issues_status_idx ON issues(status)`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS schedule_items_project_id_idx ON schedule_items(project_id)`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS project_activity_project_id_idx ON project_activity(project_id)`).catch(() => {});
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

// Register — create a new account
app.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!email || !password) return apiError(res, 400, "email and password required");
    if (password.length < 6) return apiError(res, 400, "Password must be at least 6 characters");

    const { rows: existing } = await pool.query(
      `SELECT id FROM users WHERE lower(email) = lower($1)`, [email]
    );
    if (existing.length) return apiError(res, 409, "An account with that email already exists");

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (id, email, name, password_hash)
       VALUES (gen_random_uuid(), $1, $2, $3)
       RETURNING id, email, name`,
      [email.toLowerCase().trim(), (name || "").trim() || null, hash]
    );

    const user = rows[0];
    const token = signSessionToken(user.id);
    res.status(201).json({ token, user });
  } catch (e) {
    console.error(e);
    return apiError(res, 500, "Server error");
  }
});

// Login — email + password
app.post("/auth/login", async (req, res) => {
  try {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    if (!checkLoginRateLimit(clientIp)) return apiError(res, 429, "Too many login attempts — try again in 15 minutes");
    const { email, password } = req.body || {};
    if (!email || !password) return apiError(res, 400, "email and password required");

    const { rows } = await pool.query(
      `SELECT id, email, name, password_hash FROM users WHERE lower(email) = lower($1)`,
      [email]
    );
    const user = rows[0];
    if (!user) return apiError(res, 401, "Invalid email or password");

    if (!user.password_hash) return apiError(res, 401, "Invalid email or password");
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return apiError(res, 401, "Invalid email or password");

    const token = signSessionToken(user.id);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e) {
    console.error(e);
    return apiError(res, 500, "Server error");
  }
});

// Dev-login kept for local dev only
app.post("/auth/dev-login", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return apiError(res, 404, "Not found");
  }
  try {
    const { email } = req.body || {};
    if (!email) return apiError(res, 400, "email required");
    const { rows } = await pool.query(
      `SELECT id, email, name FROM users WHERE lower(email) = lower($1)`, [email]
    );
    const user = rows[0];
    if (!user) return apiError(res, 404, "User not found");
    res.json({ token: signSessionToken(user.id), user });
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

app.post("/projects", requireAuth, async (req, res) => {
  try {
    const { name, location } = req.body || {};
    if (!name?.trim()) return apiError(res, 400, "Project name is required");

    const { rows } = await pool.query(
      `INSERT INTO projects (id, name, location)
       VALUES (gen_random_uuid(), $1, $2)
       RETURNING id, name, location`,
      [name.trim(), (location || "").trim() || null]
    );
    const project = rows[0];

    // Creator becomes GC_ADMIN
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'GC_ADMIN')`,
      [project.id, req.userId]
    );

    res.status(201).json({ ...project, role: "GC_ADMIN" });
  } catch (e) {
    console.error(e);
    return apiError(res, 500, "Server error");
  }
});

// Add a user (by email) to a project
app.post("/projects/:projectId/members", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { email, role } = req.body || {};
    if (!email) return apiError(res, 400, "email is required");

    const membership = await requireProjectMember(projectId, req.userId);
    if (!isGcRole(membership.role)) return apiError(res, 403, "GC role required");

    const validRole = String(role || "SUB").toUpperCase();
    const allowedRoles = ["GC_ADMIN", "GC_SUPER", "GC_PM", "SUB_SUPER", "SUB_FOREMAN", "SUB"];
    if (!allowedRoles.includes(validRole)) return apiError(res, 400, `Invalid role. Choose: ${allowedRoles.join(", ")}`);

    const { rows: userRows } = await pool.query(
      `SELECT id, name, email FROM users WHERE lower(email) = lower($1)`, [email]
    );
    if (!userRows.length) return apiError(res, 404, "No account found with that email. Ask them to register first.");

    const targetUser = userRows[0];

    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [projectId, targetUser.id, validRole]
    );

    res.json({ ok: true, user: { id: targetUser.id, name: targetUser.name, email: targetUser.email, role: validRole } });
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
  }
});

// List project members
app.get("/projects/:projectId/members", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    await requireProjectMember(projectId, req.userId);

    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, pm.role
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1
       ORDER BY pm.role, u.name`,
      [projectId]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    return handleThrownAccessError(res, e);
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
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
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
         ORDER BY i.created_at DESC LIMIT 500`,
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
         ORDER BY i.created_at DESC LIMIT 500`,
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

    if (issue.assigned_company_id) {
      notifyCompanyMembers(
        projectId,
        issue.assigned_company_id,
        `New Issue Assigned: ${issue.title}`,
        `You have a new issue assigned to your company.\n\nTitle: ${issue.title}\nLocation: ${issue.location || "—"}\nTrade: ${issue.trade || "—"}\n\nLog in to GC Suite to view details.`
      );
    }

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

app.put("/schedule-item/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");

    const item = await getScheduleItem(id);
    if (!item) return apiError(res, 404, "Schedule item not found");

    await requireGcMembership(item.project_id, req.userId);

    const { title, start_at, end_at, due_date, notes, status } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE schedule_items
       SET title    = COALESCE($1, title),
           start_at = COALESCE($2::timestamptz, start_at),
           end_at   = COALESCE($3::timestamptz, end_at),
           due_date = COALESCE($4::date, due_date),
           notes    = COALESCE($5, notes),
           status   = COALESCE($6, status)
       WHERE id = $7
       RETURNING *`,
      [
        title || null,
        normalizeDateInput(start_at) || null,
        normalizeDateInput(end_at) || null,
        normalizeDateInput(due_date) || null,
        notes || null,
        status || null,
        id,
      ]
    );
    res.json(rows[0]);
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

    // Find an open (non-compiled) log for today. If only compiled ones exist,
    // create a fresh one so the user can always start a new entry after filing.
    let { rows } = await pool.query(
      `SELECT * FROM daily_logs
       WHERE project_id = $1 AND created_by_user_id = $2 AND log_date = $3
         AND status != 'COMPILED'
       ORDER BY created_at DESC LIMIT 1`,
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

// Reopen a compiled log (set status back to IN_PROGRESS)
app.post("/daily-log/:logId/reopen", requireAuth, async (req, res) => {
  try {
    const { logId } = req.params;
    if (!isUuid(logId)) return apiError(res, 400, "Invalid logId");

    const log = await getDailyLog(logId);
    if (!log) return apiError(res, 404, "Log not found");

    await requireProjectMember(log.project_id, req.userId);

    if (log.created_by_user_id !== req.userId)
      return apiError(res, 403, "Can only reopen your own log");

    const { rows } = await pool.query(
      `UPDATE daily_logs
         SET status = 'IN_PROGRESS', compiled_at = NULL
       WHERE id = $1 RETURNING *`,
      [logId]
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

// ─── Plan Pins ────────────────────────────────────────────────────────────────

app.get("/projects/:projectId/plans/:sheetId/pins", requireAuth, async (req, res) => {
  try {
    const { projectId, sheetId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { rows } = await pool.query(
      `SELECT i.id, i.title, i.trade, i.status, i.location, i.pin_x, i.pin_y, i.plan_sheet_id,
              u.name AS created_by_name
       FROM issues i
       LEFT JOIN users u ON u.id = i.created_by_user_id
       WHERE i.project_id = $1 AND i.plan_sheet_id = $2
       ORDER BY i.created_at DESC`,
      [projectId, sheetId]
    );
    res.json(rows);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

// Update POST /punch to accept pin fields (patched at end since original is earlier)
// Pins are set via PUT on an existing issue:
app.patch("/punch/:issueId/pin", requireAuth, async (req, res) => {
  try {
    const { issueId } = req.params;
    if (!isUuid(issueId)) return apiError(res, 400, "Invalid issueId");
    const issue = await getIssue(issueId);
    if (!issue) return apiError(res, 404, "Issue not found");
    await requireGcMembership(issue.project_id, req.userId);
    const { plan_sheet_id, pin_x, pin_y } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE issues SET plan_sheet_id=$2, pin_x=$3, pin_y=$4 WHERE id=$1 RETURNING *`,
      [issueId, plan_sheet_id || null, pin_x ?? null, pin_y ?? null]
    );
    res.json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

// ─── RFIs ─────────────────────────────────────────────────────────────────────

// Guarantee tables exist on first use — handles cases where startup migration
// ran on an old deploy before these tables were added.
let _tablesEnsured = false;
async function ensureNewTables() {
  if (_tablesEnsured) return;
  _tablesEnsured = true;
  await pool.query(`CREATE SEQUENCE IF NOT EXISTS rfis_rfi_number_seq`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS rfis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE
  )`).catch(() => {});
  // Add columns individually so an old/partial table schema gets patched
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS rfi_number INTEGER DEFAULT nextval('rfis_rfi_number_seq')`).catch(() => {});
  // Drop NOT NULL from every legacy column so old unknown schemas don't block inserts
  await pool.query(`
    DO $$ DECLARE col RECORD; BEGIN
      FOR col IN SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='rfis'
        AND is_nullable='NO' AND column_name <> 'id'
      LOOP EXECUTE 'ALTER TABLE rfis ALTER COLUMN "' || col.column_name || '" DROP NOT NULL'; END LOOP;
    END $$
  `).catch(() => {});
  // Also set a default on any legacy numeric/text columns that might lack one
  await pool.query(`ALTER TABLE rfis ALTER COLUMN "number" SET DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ALTER COLUMN "subject" SET DEFAULT ''`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id)`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS title TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS question TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS to_name TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS due_date DATE`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'OPEN'`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS response TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS responded_by_user_id UUID REFERENCES users(id)`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ`).catch(() => {});
  await pool.query(`ALTER TABLE rfis ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`).catch(() => {});
  await pool.query(`ALTER SEQUENCE IF EXISTS rfis_rfi_number_seq OWNED BY rfis.rfi_number`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS rfis_project_id_idx ON rfis(project_id)`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS rfi_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfi_id UUID NOT NULL REFERENCES rfis(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL, original_name TEXT, mime_type TEXT,
    uploaded_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS submittals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL, spec_section TEXT, submittal_type TEXT,
    submitted_by TEXT, submitted_date DATE,
    status TEXT NOT NULL DEFAULT 'Required',
    notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS submittals_project_id_idx ON submittals(project_id)`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS submittal_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submittal_id UUID NOT NULL REFERENCES submittals(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL, original_name TEXT, mime_type TEXT,
    uploaded_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, endpoint)
  )`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS plan_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sheet_id TEXT NOT NULL, rev TEXT NOT NULL DEFAULT '',
    file_path TEXT NOT NULL, created_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS plan_annotations_sheet_idx ON plan_annotations(project_id, sheet_id)`).catch(() => {});

  // Budget
  await pool.query(`CREATE TABLE IF NOT EXISTS budget_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cost_code TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    original_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    approved_co_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    committed_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    actual_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});

  // Change Events (PCOs)
  await pool.query(`CREATE TABLE IF NOT EXISTS change_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    number SERIAL,
    title TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT 'OTHER',
    status TEXT NOT NULL DEFAULT 'DRAFT',
    potential_impact NUMERIC(14,2) NOT NULL DEFAULT 0,
    days_impact INT NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});

  // Change Orders (COs)
  await pool.query(`CREATE TABLE IF NOT EXISTS change_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    number SERIAL,
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'DRAFT',
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    days_impact INT NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});

  // Project Directory
  await pool.query(`CREATE TABLE IF NOT EXISTS project_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    trade TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});

  // Meetings
  await pool.query(`CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    meeting_type TEXT NOT NULL DEFAULT 'OAC',
    title TEXT NOT NULL DEFAULT '',
    meeting_date DATE,
    location TEXT NOT NULL DEFAULT '',
    attendees TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});

  await pool.query(`CREATE TABLE IF NOT EXISTS meeting_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    item_number INT NOT NULL DEFAULT 1,
    topic TEXT NOT NULL DEFAULT '',
    discussion TEXT NOT NULL DEFAULT '',
    action_required TEXT NOT NULL DEFAULT '',
    responsible_party TEXT NOT NULL DEFAULT '',
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});

  // Observations
  await pool.query(`CREATE TABLE IF NOT EXISTS observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    obs_type TEXT NOT NULL DEFAULT 'GENERAL',
    title TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    trade TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'Medium',
    status TEXT NOT NULL DEFAULT 'OPEN',
    description TEXT NOT NULL DEFAULT '',
    photo_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});
}

/* ── BUDGET ─────────────────────────────────────────────────────────── */

app.get("/projects/:projectId/budget", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { rows } = await pool.query(
      `SELECT * FROM budget_items WHERE project_id=$1 ORDER BY created_at ASC`,
      [projectId]
    );
    res.json(rows);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.post("/projects/:projectId/budget", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { cost_code = "", description = "", category = "", original_amount = 0 } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO budget_items(project_id,cost_code,description,category,original_amount)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [projectId, cost_code, description, category, original_amount]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.put("/budget-item/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { cost_code, description, category, original_amount, approved_co_amount, committed_amount, actual_cost } = req.body;
    const { rows } = await pool.query(
      `UPDATE budget_items SET cost_code=$1,description=$2,category=$3,
       original_amount=$4,approved_co_amount=$5,committed_amount=$6,actual_cost=$7
       WHERE id=$8 RETURNING *`,
      [cost_code, description, category, original_amount, approved_co_amount, committed_amount, actual_cost, id]
    );
    if (!rows.length) return apiError(res, 404, "Not found");
    res.json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.delete("/budget-item/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    await pool.query(`DELETE FROM budget_items WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

/* ── CHANGE EVENTS (PCOs) ────────────────────────────────────────────── */

app.get("/projects/:projectId/change-events", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { rows } = await pool.query(
      `SELECT * FROM change_events WHERE project_id=$1 ORDER BY created_at DESC`,
      [projectId]
    );
    res.json(rows);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.post("/projects/:projectId/change-events", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { title = "", reason = "OTHER", potential_impact = 0, days_impact = 0, description = "" } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO change_events(project_id,title,reason,potential_impact,days_impact,description)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [projectId, title, reason, potential_impact, days_impact, description]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.put("/change-event/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { title, reason, status, potential_impact, days_impact, description } = req.body;
    const { rows } = await pool.query(
      `UPDATE change_events SET title=$1,reason=$2,status=$3,potential_impact=$4,days_impact=$5,
       description=$6,updated_at=NOW() WHERE id=$7 RETURNING *`,
      [title, reason, status, potential_impact, days_impact, description, id]
    );
    if (!rows.length) return apiError(res, 404, "Not found");
    res.json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.delete("/change-event/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    await pool.query(`DELETE FROM change_events WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

/* ── CHANGE ORDERS (COs) ─────────────────────────────────────────────── */

app.get("/projects/:projectId/change-orders", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { rows } = await pool.query(
      `SELECT * FROM change_orders WHERE project_id=$1 ORDER BY created_at DESC`,
      [projectId]
    );
    res.json(rows);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.post("/projects/:projectId/change-orders", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { title = "", amount = 0, days_impact = 0, description = "" } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO change_orders(project_id,title,amount,days_impact,description)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [projectId, title, amount, days_impact, description]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.put("/change-order/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { title, status, amount, days_impact, description } = req.body;
    const executed_at = status === "EXECUTED" ? "NOW()" : "NULL";
    const { rows } = await pool.query(
      `UPDATE change_orders SET title=$1,status=$2,amount=$3,days_impact=$4,
       description=$5,executed_at=${executed_at},updated_at=NOW() WHERE id=$6 RETURNING *`,
      [title, status, amount, days_impact, description, id]
    );
    if (!rows.length) return apiError(res, 404, "Not found");
    res.json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.delete("/change-order/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    await pool.query(`DELETE FROM change_orders WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

/* ── PROJECT DIRECTORY ───────────────────────────────────────────────── */

app.get("/projects/:projectId/contacts", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { rows } = await pool.query(
      `SELECT * FROM project_contacts WHERE project_id=$1 ORDER BY company ASC, name ASC`,
      [projectId]
    );
    res.json(rows);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.post("/projects/:projectId/contacts", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { name = "", company = "", role = "", trade = "", phone = "", email = "", notes = "" } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO project_contacts(project_id,name,company,role,trade,phone,email,notes)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [projectId, name, company, role, trade, phone, email, notes]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.put("/contact/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { name, company, role, trade, phone, email, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE project_contacts SET name=$1,company=$2,role=$3,trade=$4,phone=$5,email=$6,notes=$7
       WHERE id=$8 RETURNING *`,
      [name, company, role, trade, phone, email, notes, id]
    );
    if (!rows.length) return apiError(res, 404, "Not found");
    res.json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.delete("/contact/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    await pool.query(`DELETE FROM project_contacts WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

/* ── MEETINGS ────────────────────────────────────────────────────────── */

app.get("/projects/:projectId/meetings", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { rows } = await pool.query(
      `SELECT * FROM meetings WHERE project_id=$1 ORDER BY meeting_date DESC NULLS LAST, created_at DESC`,
      [projectId]
    );
    res.json(rows);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.post("/projects/:projectId/meetings", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { meeting_type = "OAC", title = "", meeting_date = null, location = "", attendees = "", notes = "" } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO meetings(project_id,meeting_type,title,meeting_date,location,attendees,notes)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [projectId, meeting_type, title, meeting_date || null, location, attendees, notes]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.get("/meeting/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { rows } = await pool.query(`SELECT * FROM meetings WHERE id=$1`, [id]);
    if (!rows.length) return apiError(res, 404, "Not found");
    const { rows: items } = await pool.query(
      `SELECT * FROM meeting_items WHERE meeting_id=$1 ORDER BY item_number ASC`,
      [id]
    );
    res.json({ ...rows[0], items });
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.put("/meeting/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { meeting_type, title, meeting_date, location, attendees, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE meetings SET meeting_type=$1,title=$2,meeting_date=$3,location=$4,attendees=$5,notes=$6
       WHERE id=$7 RETURNING *`,
      [meeting_type, title, meeting_date || null, location, attendees, notes, id]
    );
    if (!rows.length) return apiError(res, 404, "Not found");
    res.json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.delete("/meeting/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    await pool.query(`DELETE FROM meetings WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.post("/meeting/:id/items", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { topic = "", discussion = "", action_required = "", responsible_party = "", due_date = null, item_number = 1 } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO meeting_items(meeting_id,item_number,topic,discussion,action_required,responsible_party,due_date)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, item_number, topic, discussion, action_required, responsible_party, due_date || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.put("/meeting-item/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { topic, discussion, action_required, responsible_party, due_date, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE meeting_items SET topic=$1,discussion=$2,action_required=$3,
       responsible_party=$4,due_date=$5,status=$6 WHERE id=$7 RETURNING *`,
      [topic, discussion, action_required, responsible_party, due_date || null, status, id]
    );
    if (!rows.length) return apiError(res, 404, "Not found");
    res.json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.delete("/meeting-item/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    await pool.query(`DELETE FROM meeting_items WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

/* ── OBSERVATIONS ────────────────────────────────────────────────────── */

app.get("/projects/:projectId/observations", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { rows } = await pool.query(
      `SELECT * FROM observations WHERE project_id=$1 ORDER BY created_at DESC`,
      [projectId]
    );
    res.json(rows);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.post("/projects/:projectId/observations", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { obs_type = "GENERAL", title = "", location = "", trade = "", priority = "Medium", description = "", photo_url = "" } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO observations(project_id,obs_type,title,location,trade,priority,description,photo_url)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [projectId, obs_type, title, location, trade, priority, description, photo_url]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.put("/observation/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { obs_type, title, location, trade, priority, status, description, photo_url } = req.body;
    const { rows } = await pool.query(
      `UPDATE observations SET obs_type=$1,title=$2,location=$3,trade=$4,priority=$5,
       status=$6,description=$7,photo_url=$8 WHERE id=$9 RETURNING *`,
      [obs_type, title, location, trade, priority, status, description, photo_url, id]
    );
    if (!rows.length) return apiError(res, 404, "Not found");
    res.json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.delete("/observation/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    await pool.query(`DELETE FROM observations WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.get("/projects/:projectId/rfis", requireAuth, async (req, res) => {
  await ensureNewTables();
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { rows } = await pool.query(
      `SELECT r.*, u.name AS created_by_name, ru.name AS responded_by_name
       FROM rfis r
       LEFT JOIN users u ON u.id = r.created_by_user_id
       LEFT JOIN users ru ON ru.id = r.responded_by_user_id
       WHERE r.project_id = $1
       ORDER BY r.created_at DESC`,
      [projectId]
    );
    res.json(rows);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.post("/projects/:projectId/rfis", requireAuth, async (req, res) => {
  await ensureNewTables();
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { title, question, to_name, due_date } = req.body || {};
    if (!title?.trim()) return apiError(res, 400, "title required");
    if (!question?.trim()) return apiError(res, 400, "question required");
    const { rows } = await pool.query(
      `INSERT INTO rfis (project_id, created_by_user_id, title, question, to_name, due_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [projectId, req.userId, title.trim(), question.trim(), to_name?.trim() || null,
       due_date || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.put("/rfi/:rfiId", requireAuth, async (req, res) => {
  try {
    const { rfiId } = req.params;
    if (!isUuid(rfiId)) return apiError(res, 400, "Invalid rfiId");
    const { rows: existing } = await pool.query(`SELECT * FROM rfis WHERE id=$1`, [rfiId]);
    if (!existing.length) return apiError(res, 404, "RFI not found");
    const rfi = existing[0];
    await requireProjectMember(rfi.project_id, req.userId);
    const { title, question, to_name, due_date } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE rfis SET title=COALESCE($2,title), question=COALESCE($3,question),
       to_name=COALESCE($4,to_name), due_date=COALESCE($5,due_date) WHERE id=$1 RETURNING *`,
      [rfiId, title?.trim()||null, question?.trim()||null, to_name?.trim()||null, due_date||null]
    );
    res.json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.post("/rfi/:rfiId/respond", requireAuth, async (req, res) => {
  try {
    const { rfiId } = req.params;
    if (!isUuid(rfiId)) return apiError(res, 400, "Invalid rfiId");
    const { rows: existing } = await pool.query(`SELECT * FROM rfis WHERE id=$1`, [rfiId]);
    if (!existing.length) return apiError(res, 404, "RFI not found");
    const rfi = existing[0];
    await requireProjectMember(rfi.project_id, req.userId);
    const { response } = req.body || {};
    if (!response?.trim()) return apiError(res, 400, "response required");
    const { rows } = await pool.query(
      `UPDATE rfis SET response=$2, status='ANSWERED', responded_by_user_id=$3,
       responded_at=NOW() WHERE id=$1 RETURNING *`,
      [rfiId, response.trim(), req.userId]
    );
    // Notify the RFI creator
    await sendPushToUser(rfi.created_by_user_id, "RFI Answered", rfi.title);
    res.json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.post("/rfi/:rfiId/close", requireAuth, async (req, res) => {
  try {
    const { rfiId } = req.params;
    if (!isUuid(rfiId)) return apiError(res, 400, "Invalid rfiId");
    const { rows: existing } = await pool.query(`SELECT * FROM rfis WHERE id=$1`, [rfiId]);
    if (!existing.length) return apiError(res, 404, "RFI not found");
    await requireGcMembership(existing[0].project_id, req.userId);
    const { rows } = await pool.query(
      `UPDATE rfis SET status='CLOSED' WHERE id=$1 RETURNING *`, [rfiId]
    );
    res.json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

// ─── Push Notifications ───────────────────────────────────────────────────────

app.get("/push/vapid-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post("/push/subscribe", requireAuth, async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) return apiError(res, 400, "Invalid subscription");
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh=$3, auth=$4`,
      [req.userId, endpoint, keys.p256dh, keys.auth]
    );
    res.json({ ok: true });
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.delete("/push/unsubscribe", requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    await pool.query(`DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2`,
      [req.userId, endpoint]);
    res.json({ ok: true });
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

// ─── Form Submissions (Safety Inspection, Toolbox Talk, etc.) ─────────────────

app.get("/projects/:projectId/form-submissions", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { form_type } = req.query;
    const { rows } = await pool.query(
      `SELECT f.*, u.name AS created_by_name
       FROM form_submissions f
       LEFT JOIN users u ON u.id = f.created_by_user_id
       WHERE f.project_id=$1 ${form_type ? "AND f.form_type=$2" : ""}
       ORDER BY f.created_at DESC LIMIT 100`,
      form_type ? [projectId, form_type] : [projectId]
    );
    res.json(rows);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.post("/projects/:projectId/form-submissions", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { form_type, data, status } = req.body || {};
    if (!form_type) return apiError(res, 400, "form_type required");
    const finalStatus = status === "SUBMITTED" ? "SUBMITTED" : "DRAFT";
    const { rows } = await pool.query(
      `INSERT INTO form_submissions (project_id, created_by_user_id, form_type, status, data, submitted_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,
      [projectId, req.userId, form_type, finalStatus, JSON.stringify(data || {}),
       finalStatus === "SUBMITTED" ? new Date() : null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.get("/form-submission/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { rows } = await pool.query(`SELECT * FROM form_submissions WHERE id=$1`, [id]);
    if (!rows.length) return apiError(res, 404, "Not found");
    await requireProjectMember(rows[0].project_id, req.userId);
    res.json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.put("/form-submission/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { rows: existing } = await pool.query(`SELECT * FROM form_submissions WHERE id=$1`, [id]);
    if (!existing.length) return apiError(res, 404, "Not found");
    await requireProjectMember(existing[0].project_id, req.userId);
    const { data, status } = req.body || {};
    const finalStatus = status === "SUBMITTED" ? "SUBMITTED" : (status === "DRAFT" ? "DRAFT" : existing[0].status);
    const { rows } = await pool.query(
      `UPDATE form_submissions SET data=COALESCE($2::jsonb,data), status=$3,
       submitted_at=CASE WHEN $3='SUBMITTED' AND submitted_at IS NULL THEN NOW() ELSE submitted_at END
       WHERE id=$1 RETURNING *`,
      [id, data ? JSON.stringify(data) : null, finalStatus]
    );
    res.json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

// ─── Submittal Log ────────────────────────────────────────────────────────────

app.get("/projects/:projectId/submittals", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { rows } = await pool.query(
      `SELECT s.*, u.name AS created_by_name
       FROM submittals s
       LEFT JOIN users u ON u.id = s.created_by_user_id
       WHERE s.project_id = $1
       ORDER BY s.created_at DESC LIMIT 200`,
      [projectId]
    );
    res.json(rows);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.post("/projects/:projectId/submittals", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isUuid(projectId)) return apiError(res, 400, "Invalid projectId");
    await requireProjectMember(projectId, req.userId);
    const { spec_section, title, submittal_type, submitted_by, submitted_date, status, notes } = req.body || {};
    if (!title) return apiError(res, 400, "title required");
    const validTypes = ["Shop Drawing","Sample","Product Data","O&M Manual","Other"];
    const validStatuses = ["Required","Submitted","Under Review","Approved","Rejected"];
    const { rows } = await pool.query(
      `INSERT INTO submittals (project_id, created_by_user_id, spec_section, title, submittal_type, submitted_by, submitted_date, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [projectId, req.userId, spec_section || null, title,
       validTypes.includes(submittal_type) ? submittal_type : "Shop Drawing",
       submitted_by || null, normalizeDateInput(submitted_date),
       validStatuses.includes(status) ? status : "Required", notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.put("/submittal/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { rows: existing } = await pool.query(`SELECT * FROM submittals WHERE id=$1`, [id]);
    if (!existing.length) return apiError(res, 404, "Not found");
    await requireProjectMember(existing[0].project_id, req.userId);
    const { spec_section, title, submittal_type, submitted_by, submitted_date, status, notes } = req.body || {};
    const validTypes = ["Shop Drawing","Sample","Product Data","O&M Manual","Other"];
    const validStatuses = ["Required","Submitted","Under Review","Approved","Rejected"];
    const { rows } = await pool.query(
      `UPDATE submittals SET
         spec_section   = COALESCE($2, spec_section),
         title          = COALESCE($3, title),
         submittal_type = COALESCE($4, submittal_type),
         submitted_by   = COALESCE($5, submitted_by),
         submitted_date = COALESCE($6, submitted_date),
         status         = COALESCE($7, status),
         notes          = COALESCE($8, notes)
       WHERE id=$1 RETURNING *`,
      [id, spec_section ?? null, title ?? null,
       (submittal_type && validTypes.includes(submittal_type)) ? submittal_type : null,
       submitted_by ?? null, submitted_date ? normalizeDateInput(submitted_date) : null,
       (status && validStatuses.includes(status)) ? status : null, notes ?? null]
    );
    res.json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.delete("/submittal/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { rows } = await pool.query(`SELECT * FROM submittals WHERE id=$1`, [id]);
    if (!rows.length) return apiError(res, 404, "Not found");
    await requireProjectMember(rows[0].project_id, req.userId);
    await pool.query(`DELETE FROM submittals WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

// ─── RFI Attachments ──────────────────────────────────────────────────────────

app.get("/rfi/:rfiId/attachments", requireAuth, async (req, res) => {
  try {
    const { rfiId } = req.params;
    if (!isUuid(rfiId)) return apiError(res, 400, "Invalid rfiId");
    const { rows: rfiRows } = await pool.query(`SELECT * FROM rfis WHERE id=$1`, [rfiId]);
    if (!rfiRows.length) return apiError(res, 404, "RFI not found");
    await requireProjectMember(rfiRows[0].project_id, req.userId);
    const { rows } = await pool.query(
      `SELECT a.*, u.name AS uploaded_by_name FROM rfi_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by_user_id
       WHERE a.rfi_id=$1 ORDER BY a.created_at ASC`,
      [rfiId]
    );
    res.json(rows);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.post("/rfi/:rfiId/attachments", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const { rfiId } = req.params;
    if (!isUuid(rfiId)) return apiError(res, 400, "Invalid rfiId");
    const { rows: rfiRows } = await pool.query(`SELECT * FROM rfis WHERE id=$1`, [rfiId]);
    if (!rfiRows.length) return apiError(res, 404, "RFI not found");
    await requireProjectMember(rfiRows[0].project_id, req.userId);
    if (!req.file) return apiError(res, 400, "No file uploaded");
    const ext = path.extname(req.file.originalname || "").toLowerCase() || "";
    const newFilename = `rfi_${randomUUID()}${ext}`;
    const newPath = path.join(UPLOAD_ROOT, newFilename);
    await fs.rename(req.file.path, newPath);
    const fileUrl = `/uploads/${newFilename}`;
    const { rows } = await pool.query(
      `INSERT INTO rfi_attachments (rfi_id, file_url, original_name, uploaded_by_user_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [rfiId, fileUrl, req.file.originalname || newFilename, req.userId]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.delete("/rfi-attachment/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { rows } = await pool.query(
      `SELECT a.*, r.project_id FROM rfi_attachments a JOIN rfis r ON r.id=a.rfi_id WHERE a.id=$1`, [id]
    );
    if (!rows.length) return apiError(res, 404, "Not found");
    await requireProjectMember(rows[0].project_id, req.userId);
    const fileUrl = rows[0].file_url || "";
    if (fileUrl.startsWith("/uploads/")) {
      const filePath = path.join(UPLOAD_ROOT, path.basename(fileUrl));
      await fs.unlink(filePath).catch(() => {});
    }
    await pool.query(`DELETE FROM rfi_attachments WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

/* ─────────────────────────────────────────────────────────────────────────────
   SUBMITTAL ATTACHMENTS
───────────────────────────────────────────────────────────────────────────── */

app.get("/submittal/:id/attachments", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { rows: [sub] } = await pool.query(`SELECT * FROM submittals WHERE id = $1`, [id]);
    if (!sub) return apiError(res, 404, "Submittal not found");
    await requireProjectMember(sub.project_id, req.userId);
    const { rows } = await pool.query(
      `SELECT sa.*, u.name AS uploader_name FROM submittal_attachments sa
       LEFT JOIN users u ON u.id = sa.uploaded_by_user_id
       WHERE sa.submittal_id = $1 ORDER BY sa.created_at ASC`,
      [id]
    );
    res.json(rows);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.post("/submittal/:id/attachments", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    if (!req.file) return apiError(res, 400, "file required");
    const { rows: [sub] } = await pool.query(`SELECT * FROM submittals WHERE id = $1`, [id]);
    if (!sub) return apiError(res, 404, "Submittal not found");
    await requireProjectMember(sub.project_id, req.userId);
    const { rows } = await pool.query(
      `INSERT INTO submittal_attachments (submittal_id, file_path, original_name, mime_type, uploaded_by_user_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, req.file.path, req.file.originalname, req.file.mimetype, req.userId]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.delete("/submittal-attachment/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return apiError(res, 400, "Invalid id");
    const { rows: [att] } = await pool.query(`SELECT sa.*, s.project_id FROM submittal_attachments sa JOIN submittals s ON s.id = sa.submittal_id WHERE sa.id = $1`, [id]);
    if (!att) return apiError(res, 404, "Attachment not found");
    await requireProjectMember(att.project_id, req.userId);
    await pool.query(`DELETE FROM submittal_attachments WHERE id = $1`, [id]);
    try { await fs.unlink(att.file_path); } catch {}
    res.json({ ok: true });
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

/* ─────────────────────────────────────────────────────────────────────────────
   PLAN ANNOTATIONS
───────────────────────────────────────────────────────────────────────────── */

app.get("/projects/:projectId/plans/:sheetId/annotation", requireAuth, async (req, res) => {
  try {
    const { projectId, sheetId } = req.params;
    const { rev = "" } = req.query;
    await requireProjectMember(projectId, req.userId);
    const { rows } = await pool.query(
      `SELECT * FROM plan_annotations WHERE project_id = $1 AND sheet_id = $2 AND rev = $3
       ORDER BY created_at DESC LIMIT 1`,
      [projectId, decodeURIComponent(sheetId), rev]
    );
    res.json(rows[0] || null);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.post("/projects/:projectId/plans/:sheetId/annotation", requireAuth, upload.single("image"), async (req, res) => {
  try {
    const { projectId, sheetId } = req.params;
    const { rev = "" } = req.body;
    if (!req.file) return apiError(res, 400, "image required");
    await requireProjectMember(projectId, req.userId);
    // Replace previous annotation for same sheet+rev
    const { rows: old } = await pool.query(
      `SELECT id, file_path FROM plan_annotations WHERE project_id = $1 AND sheet_id = $2 AND rev = $3`,
      [projectId, decodeURIComponent(sheetId), rev]
    );
    for (const o of old) {
      await pool.query(`DELETE FROM plan_annotations WHERE id = $1`, [o.id]);
      try { await fs.unlink(o.file_path); } catch {}
    }
    const { rows } = await pool.query(
      `INSERT INTO plan_annotations (project_id, sheet_id, rev, file_path, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [projectId, decodeURIComponent(sheetId), rev, req.file.path, req.userId]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.delete("/projects/:projectId/plans/:sheetId/annotation", requireAuth, async (req, res) => {
  try {
    const { projectId, sheetId } = req.params;
    const { rev = "" } = req.query;
    await requireProjectMember(projectId, req.userId);
    const { rows } = await pool.query(
      `SELECT id, file_path FROM plan_annotations WHERE project_id = $1 AND sheet_id = $2 AND rev = $3`,
      [projectId, decodeURIComponent(sheetId), rev]
    );
    for (const r of rows) {
      await pool.query(`DELETE FROM plan_annotations WHERE id = $1`, [r.id]);
      try { await fs.unlink(r.file_path); } catch {}
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); return handleThrownAccessError(res, e); }
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Server error" });
});

// ─── AI ───────────────────────────────────────────────────────────────────────

app.post("/ai/parse", requireAuth, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text?.trim()) return apiError(res, 400, "text required");

    const key = process.env.GEMINI_API_KEY;
    if (!key) return apiError(res, 503, "AI not configured");

    const today = new Date().toISOString().slice(0, 10);
    const tmr   = new Date(Date.now() + 864e5).toISOString().slice(0, 10);

    const prompt = `You are a construction superintendent assistant. Parse this field note.

Field note: "${text.trim().replace(/"/g, "'")}"
Today: ${today}  Tomorrow: ${tmr}

Reply with EXACTLY one line, no other text:
TYPE|TITLE|TRADE|LOCATION|PRIORITY|DUE_DATE|START_DATE

TYPE = issue, schedule, or daily_log
TITLE = concise label max 8 words
TRADE = one of: Electrical Plumbing HVAC Drywall Concrete Flooring Paint Ceiling Doors/Hardware Glazing Millwork Roofing Site Framing Steel Masonry General — or null
LOCATION = location string or null
PRIORITY = Low Medium High or null
DUE_DATE = YYYY-MM-DD or null
START_DATE = YYYY-MM-DD or null

type: issue=problem/deficiency, schedule=future event, daily_log=happened today
trade: door/glass/storefront→Glazing; ceiling grid→Ceiling; outlet/wire→Electrical; pipe/drain→Plumbing

Example: issue|Door dragging North Entry|Glazing|North Entry|Medium|null|null`;

    const geminiBody = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1000 },
    });
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
    const geminiHeaders = { "Content-Type": "application/json", "x-goog-api-key": key };

    let r = await fetch(geminiUrl, { method: "POST", headers: geminiHeaders, body: geminiBody });

    if (r.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      r = await fetch(geminiUrl, { method: "POST", headers: geminiHeaders, body: geminiBody });
    }

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      console.error("Gemini error:", r.status, errText);
      return apiError(res, r.status === 429 ? 429 : 502, r.status === 429 ? "AI is busy — wait a moment and try again" : "AI service error");
    }

    const data = await r.json();
    const allText = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("\n");

    const TYPES = ["issue", "schedule", "daily_log"];
    let parsed = null;
    for (const line of allText.split("\n")) {
      const fields = line.trim().split("|").map((f) => f.trim());
      const rawType = fields[0]?.toLowerCase().replace(/[\s-]+/g, "_");
      if (fields.length >= 2 && fields[1] && TYPES.includes(rawType)) {
        const nn = (v) => (!v || v.toLowerCase() === "null" ? null : v);
        parsed = {
          type:       rawType,
          title:      fields[1] || null,
          trade:      nn(fields[2]),
          location:   nn(fields[3]),
          priority:   nn(fields[4]),
          due_date:   nn(fields[5]),
          start_date: nn(fields[6]),
        };
        break;
      }
    }

    // Keyword fallback — guarantees a result even if Gemini ignores the format
    if (!parsed?.title) {
      console.error("Pipe parse failed, using fallback. raw:", allText.slice(0, 300));
      const t = text.toLowerCase();
      let type = "issue";
      if (/schedul|pour|tomorrow|next\s+(week|month|mon|tue|wed|thu|fri)|delivery|inspection/.test(t)) type = "schedule";
      else if (/today\s+we|had\s+\d+\s+guys?|finished|completed|daily/.test(t)) type = "daily_log";
      parsed = {
        type,
        title: text.trim().split(/\s+/).slice(0, 8).join(" "),
        trade: null, location: null, priority: null, due_date: null, start_date: null,
      };
    }

    res.json(parsed);
  } catch (e) {
    console.error("AI parse error:", e);
    return apiError(res, 500, "AI parse failed");
  }
});

/* SERVER */

const server = app.listen(PORT, HOST, () => {
  console.log(`GC Suite API running on port ${PORT}`);
  ensureNewTables().catch((e) => console.error("Table migration error:", e));
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