import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import multer from "multer";
import path from "path";
import fs from "fs/promises";

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

  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  `);

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

/* PROJECT MEMBERSHIP */

app.get("/projects/:projectId/me", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    const { rows } = await pool.query(
      `SELECT role, company_id
       FROM project_members
       WHERE project_id = $1 AND user_id = $2`,
      [projectId, req.userId]
    );

    const membership = rows[0];

    if (!membership) {
      return apiError(res, 403, "Not in project");
    }

    res.json(membership);
  } catch (e) {
    console.error(e);
    return apiError(res, 500, "Server error");
  }
});

/* PROJECT COMPANIES */

app.get("/projects/:projectId/companies", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

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
    return apiError(res, 500, "Server error");
  }
});

/* ACTIVITY */

app.get("/projects/:projectId/activity", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

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
    return apiError(res, 500, "Server error");
  }
});

/* PUNCH / FIELD ISSUES */

app.get("/projects/:projectId/punch", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    const { rows } = await pool.query(
      `SELECT i.*
       FROM issues i
       WHERE i.project_id = $1
       ORDER BY i.created_at DESC`,
      [projectId]
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    return apiError(res, 500, "Server error");
  }
});

app.post("/projects/:projectId/punch", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title, trade, location, assigned_company_id, due_date } = req.body || {};

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

    return res.status(201).json(issue);
  } catch (e) {
    console.error(e);
    return apiError(res, 500, e.message || "Issue create failed");
  }
});

app.delete("/punch/:issueId", requireAuth, async (req, res) => {
  try {
    const { issueId } = req.params;

    await pool.query(`DELETE FROM issues WHERE id = $1`, [issueId]);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return apiError(res, 500, "Delete failed");
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

    if (!req.file) {
      return apiError(res, 400, "No photo uploaded");
    }

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
    return apiError(res, 500, "Server error");
  }
});

/* SCHEDULE */

app.post("/projects/:projectId/schedule", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title, date, start_at, end_at, due_date, notes } = req.body || {};

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
       RETURNING *`,
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
    return apiError(res, 500, e.message || "Schedule create failed");
  }
});

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