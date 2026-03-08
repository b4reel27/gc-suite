import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";

dotenv.config();

const app = express();

// ----------------------
// Config
// ----------------------
const PORT = Number(process.env.PORT || 3005);
const HOST = process.env.HOST || "0.0.0.0";

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");
const PLANS_UPLOAD_ROOT = path.join(UPLOADS_ROOT, "plans");

const DATA_ROOT = path.join(process.cwd(), "data", "projects");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn("⚠️  DATABASE_URL is not set. API may fail on DB routes.");
}

const CORS_ORIGIN = process.env.CORS_ORIGIN || true;

// ----------------------
// Middleware
// ----------------------
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ----------------------
// Helpers
// ----------------------
async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function safeFilename(name, fallback = "file.bin") {
  const raw = String(name || fallback);
  return raw.replace(/[^\w.\-]+/g, "_");
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
}

function signSessionToken(userId) {
  return jwt.sign({ userId, purpose: "session" }, JWT_SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.purpose !== "session") {
      return res.status(401).json({ error: "Invalid token purpose" });
    }
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

async function requireProjectMember(req, res, next) {
  try {
    const { projectId } = req.params;
    const { rows } = await pool.query(
      `SELECT pm.role, pm.company_id
       FROM project_members pm
       WHERE pm.project_id = $1 AND pm.user_id = $2`,
      [projectId, req.userId]
    );
    if (!rows[0]) return res.status(403).json({ error: "Not in project" });

    req.projectRole = rows[0].role;
    req.projectCompanyId = rows[0].company_id;
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
}

function isGcRole(role) {
  return String(role || "").toUpperCase().startsWith("GC");
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

// ----------------------
// DB
// ----------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
});

async function getMembership(projectId, userId) {
  const { rows } = await pool.query(
    `SELECT pm.role, pm.company_id
     FROM project_members pm
     WHERE pm.project_id = $1 AND pm.user_id = $2`,
    [projectId, userId]
  );
  return rows[0] || null;
}

// ----------------------
// SCHEDULE (DB bootstrap + auto-migrate for dev)
// ----------------------
async function ensureScheduleTable() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.schedule_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL,
      title text NOT NULL,
      date date NULL,
      start_at date NULL,
      end_at date NULL,
      due_date date NULL,
      notes text NULL,
      status text NOT NULL DEFAULT 'OPEN',
      created_by_user_id uuid NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`ALTER TABLE public.schedule_items ADD COLUMN IF NOT EXISTS date date;`);
  await pool.query(`ALTER TABLE public.schedule_items ADD COLUMN IF NOT EXISTS start_at date;`);
  await pool.query(`ALTER TABLE public.schedule_items ADD COLUMN IF NOT EXISTS end_at date;`);
  await pool.query(`ALTER TABLE public.schedule_items ADD COLUMN IF NOT EXISTS due_date date;`);
  await pool.query(`ALTER TABLE public.schedule_items ADD COLUMN IF NOT EXISTS notes text;`);
  await pool.query(`ALTER TABLE public.schedule_items ADD COLUMN IF NOT EXISTS status text;`);
  await pool.query(`ALTER TABLE public.schedule_items ADD COLUMN IF NOT EXISTS created_by_user_id uuid;`);
  await pool.query(`ALTER TABLE public.schedule_items ADD COLUMN IF NOT EXISTS created_at timestamptz;`);

  await pool.query(`ALTER TABLE public.schedule_items ALTER COLUMN status SET DEFAULT 'OPEN';`);
  await pool.query(`ALTER TABLE public.schedule_items ALTER COLUMN created_at SET DEFAULT now();`);

  // Backfill start_at from legacy date when possible
  await pool.query(`
    UPDATE public.schedule_items
    SET start_at = COALESCE(start_at, date, due_date)
    WHERE start_at IS NULL;
  `);

  // Keep legacy date useful for existing UI
  await pool.query(`
    UPDATE public.schedule_items
    SET date = COALESCE(date, start_at, due_date)
    WHERE date IS NULL;
  `);

  await pool.query(`
    UPDATE public.schedule_items
    SET status = CASE
      WHEN status IS NULL OR btrim(status) = '' THEN 'OPEN'
      WHEN upper(status) IN ('OPEN') THEN 'OPEN'
      WHEN upper(status) IN ('DONE','COMPLETE','COMPLETED','FINISHED') THEN 'DONE'
      WHEN upper(status) IN ('VERIFIED','VERIFY') THEN 'VERIFIED'
      WHEN upper(status) IN ('CANCELED','CANCELLED','CANCEL') THEN 'CANCELED'
      ELSE 'OPEN'
    END;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='schedule_items_status_check') THEN
        ALTER TABLE public.schedule_items DROP CONSTRAINT schedule_items_status_check;
      END IF;

      ALTER TABLE public.schedule_items
        ADD CONSTRAINT schedule_items_status_check
        CHECK (status IN ('OPEN','DONE','VERIFIED','CANCELED'));
    END $$;
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS schedule_items_project_id_idx ON public.schedule_items(project_id);`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS schedule_items_project_date_idx ON public.schedule_items(project_id, date);`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS schedule_items_project_start_at_idx ON public.schedule_items(project_id, start_at);`
  );
}

ensureScheduleTable().catch((e) => console.error("ensureScheduleTable error:", e));

// ----------------------
// Uploads / static
// ----------------------
(async () => {
  await ensureDir(UPLOADS_ROOT);
  await ensureDir(PLANS_UPLOAD_ROOT);
  await ensureDir(DATA_ROOT);
})().catch((e) => console.error("Startup ensureDir error:", e));

app.use("/uploads", express.static(UPLOADS_ROOT));

// ----------------------
// Multer upload config
// ----------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        await ensureDir(UPLOADS_ROOT);
        cb(null, UPLOADS_ROOT);
      } catch (e) {
        cb(e);
      }
    },
    filename: (_req, file, cb) => {
      const safe = safeFilename(file.originalname, "upload.bin");
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const planUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        const { projectId } = req.params;
        const dir = path.join(PLANS_UPLOAD_ROOT, projectId);
        await ensureDir(dir);
        cb(null, dir);
      } catch (e) {
        cb(e);
      }
    },
    filename: (_req, file, cb) => {
      const safe = safeFilename(file.originalname, "plan.pdf");
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ----------------------
// PLANS (JSON persistence MVP)
// ----------------------
function plansFilePath(projectId) {
  return path.join(DATA_ROOT, projectId, "plans.json");
}

async function readPlans(projectId) {
  const file = plansFilePath(projectId);
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.sheets) parsed.sheets = [];
    parsed.projectId = projectId;
    return parsed;
  } catch {
    return { projectId, sheets: [] };
  }
}

async function writePlans(projectId, data) {
  const dir = path.join(DATA_ROOT, projectId);
  await ensureDir(dir);
  const file = plansFilePath(projectId);
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

function getSheet(store, sheetId) {
  return store.sheets.find((s) => s.sheetId === sheetId);
}

function computeCurrentRevision(sheet) {
  if (!sheet?.revisions?.length) return null;
  const current = sheet.revisions.find((r) => r.status === "Current");
  return current || sheet.revisions[0];
}

function normalizeDiscipline(d) {
  const v = String(d || "").trim().toUpperCase();
  return v || "GEN";
}

function nextRev(sheet) {
  const nums = (sheet.revisions || [])
    .map((r) => parseInt(r.rev, 10))
    .filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums) : -1;
  return String(max + 1);
}

function upsertSheet(store, { sheetId, sheetNo, title, discipline }) {
  const sid = String(sheetId || "").trim() || String(sheetNo || "").trim() || `SHEET-${Date.now()}`;
  const sNo = String(sheetNo || "").trim() || sid;
  const t = String(title || "").trim() || "Untitled";
  const disc = normalizeDiscipline(discipline);

  let sheet = store.sheets.find((s) => s.sheetId === sid);
  if (!sheet) {
    sheet = { sheetId: sid, sheetNo: sNo, title: t, discipline: disc, revisions: [] };
    store.sheets.push(sheet);
  } else {
    sheet.sheetNo = sNo;
    sheet.title = t;
    sheet.discipline = disc;
    if (!Array.isArray(sheet.revisions)) sheet.revisions = [];
  }
  return sheet;
}

function addRevisionToSheet(sheet, { rev, revDate, status, fileUrl }) {
  const revStr = String(rev);
  const dateStr = String(revDate);
  const st = status;
  const url = String(fileUrl);

  if (st === "Current") {
    for (const r of sheet.revisions) {
      if (r.status === "Current") r.status = "Superseded";
    }
  }

  const existing = sheet.revisions.find((r) => String(r.rev) === revStr);
  if (existing) {
    existing.date = dateStr;
    existing.fileUrl = url;
    existing.status = st;
  } else {
    sheet.revisions.unshift({ rev: revStr, date: dateStr, status: st, fileUrl: url });
  }
}

function searchSheets(store, q, discipline) {
  const query = String(q || "").trim().toLowerCase();
  const disc = String(discipline || "").trim().toUpperCase();

  return store.sheets
    .filter((s) => {
      if (disc && normalizeDiscipline(s.discipline) !== disc) return false;
      if (!query) return true;
      return (
        String(s.sheetNo || "").toLowerCase().includes(query) ||
        String(s.sheetId || "").toLowerCase().includes(query) ||
        String(s.title || "").toLowerCase().includes(query)
      );
    })
    .map((s) => ({ ...s, current: computeCurrentRevision(s) }));
}

// ----------------------
// Health + Root
// ----------------------
app.get("/", (_req, res) => res.status(200).send("GC Suite API is running"));

app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    service: "api",
    time: new Date().toISOString(),
  })
);

// ----------------------
// DEV LOGIN
// ----------------------
app.post("/auth/dev-login", async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Dev login disabled in production" });
    }

    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "email required" });

    const { rows } = await pool.query(
      `SELECT id, email, name FROM users WHERE lower(email)=lower($1)`,
      [email]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    const token = signSessionToken(user.id);
    res.json({ token, user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------------
// Projects for current user
// ----------------------
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
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/projects/:projectId/me", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { rows } = await pool.query(
      `SELECT pm.role, pm.company_id
       FROM project_members pm
       WHERE pm.project_id = $1 AND pm.user_id = $2`,
      [projectId, req.userId]
    );
    if (!rows[0]) return res.status(403).json({ error: "Not in project" });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/projects/:projectId/companies", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    const mem = await pool.query(
      `SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2`,
      [projectId, req.userId]
    );
    if (!mem.rows[0]) return res.status(403).json({ error: "Not in project" });

    const { rows } = await pool.query(
      `SELECT DISTINCT c.id, c.name, c.type
       FROM companies c
       JOIN project_members pm ON pm.company_id = c.id
       WHERE pm.project_id = $1
       ORDER BY c.type, c.name`,
      [projectId]
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------------
// SCHEDULE ROUTES
// ----------------------
const SCHEDULE_STATUS = {
  OPEN: "OPEN",
  DONE: "DONE",
  VERIFIED: "VERIFIED",
  CANCELED: "CANCELED",
};

async function listScheduleForProject(req, res) {
  try {
    const { projectId } = req.params;

    const mem = await getMembership(projectId, req.userId);
    if (!mem) return res.status(403).json({ error: "Not in project" });

    const { rows } = await pool.query(
      `SELECT
         id,
         project_id,
         title,
         start_at,
         end_at,
         due_date,
         COALESCE(date, start_at, due_date) AS date,
         notes,
         status,
         created_at
       FROM public.schedule_items
       WHERE project_id = $1
       ORDER BY COALESCE(start_at, date, due_date) NULLS LAST, created_at DESC`,
      [projectId]
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
}

async function createScheduleForProject(req, res) {
  try {
    const { projectId } = req.params;
    const body = req.body || {};

    const mem = await getMembership(projectId, req.userId);
    if (!mem) return res.status(403).json({ error: "Not in project" });
    if (!isGcRole(mem.role)) {
      return res.status(403).json({ error: "Only GC can create schedule items" });
    }

    const title = String(body.title || "").trim();
    if (!title) {
      return res.status(400).json({ error: "title required" });
    }

    const startAt = normalizeDateInput(
      body.start_at || body.start_date || body.start || body.date || body.due_date
    );

    if (!startAt) {
      return res.status(400).json({
        error: "start_at is required",
      });
    }

    const endAt = normalizeDateInput(body.end_at || body.end_date || null);
    const dueDate = normalizeDateInput(body.due_date || null);
    const legacyDate = normalizeDateInput(body.date || startAt);
    const notes = body.notes ? String(body.notes) : null;

    const { rows } = await pool.query(
      `INSERT INTO public.schedule_items
        (project_id, title, date, start_at, end_at, due_date, notes, status, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING
         id,
         project_id,
         title,
         start_at,
         end_at,
         due_date,
         COALESCE(date, start_at, due_date) AS date,
         notes,
         status,
         created_at`,
      [
        projectId,
        title,
        legacyDate,
        startAt,
        endAt,
        dueDate,
        notes,
        SCHEDULE_STATUS.OPEN,
        req.userId,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
}

app.get("/projects/:projectId/schedule", requireAuth, listScheduleForProject);
app.get("/schedule/:projectId", requireAuth, listScheduleForProject);

app.post("/projects/:projectId/schedule", requireAuth, createScheduleForProject);
app.post("/schedule/:projectId", requireAuth, createScheduleForProject);

// DONE (GC only)
app.post("/schedule-item/:id/done", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ error: "Invalid id" });

    const { rows: existing } = await pool.query(
      `SELECT id, project_id FROM public.schedule_items WHERE id=$1`,
      [id]
    );
    const item = existing[0];
    if (!item) return res.status(404).json({ error: "Schedule item not found" });

    const mem = await getMembership(item.project_id, req.userId);
    if (!mem) return res.status(403).json({ error: "Not in project" });
    if (!isGcRole(mem.role)) return res.status(403).json({ error: "GC only" });

    const { rows } = await pool.query(
      `UPDATE public.schedule_items
       SET status='DONE'
       WHERE id=$1
       RETURNING
         id,
         project_id,
         title,
         start_at,
         end_at,
         due_date,
         COALESCE(date, start_at, due_date) AS date,
         notes,
         status,
         created_at`,
      [id]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// VERIFIED (GC only)
app.post("/schedule-item/:id/verify", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ error: "Invalid id" });

    const { rows: existing } = await pool.query(
      `SELECT id, project_id FROM public.schedule_items WHERE id=$1`,
      [id]
    );
    const item = existing[0];
    if (!item) return res.status(404).json({ error: "Schedule item not found" });

    const mem = await getMembership(item.project_id, req.userId);
    if (!mem) return res.status(403).json({ error: "Not in project" });
    if (!isGcRole(mem.role)) return res.status(403).json({ error: "GC only" });

    const { rows } = await pool.query(
      `UPDATE public.schedule_items
       SET status='VERIFIED'
       WHERE id=$1
       RETURNING
         id,
         project_id,
         title,
         start_at,
         end_at,
         due_date,
         COALESCE(date, start_at, due_date) AS date,
         notes,
         status,
         created_at`,
      [id]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// CANCELED (GC only)
app.post("/schedule-item/:id/cancel", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ error: "Invalid id" });

    const { rows: existing } = await pool.query(
      `SELECT id, project_id FROM public.schedule_items WHERE id=$1`,
      [id]
    );
    const item = existing[0];
    if (!item) return res.status(404).json({ error: "Schedule item not found" });

    const mem = await getMembership(item.project_id, req.userId);
    if (!mem) return res.status(403).json({ error: "Not in project" });
    if (!isGcRole(mem.role)) return res.status(403).json({ error: "GC only" });

    const { rows } = await pool.query(
      `UPDATE public.schedule_items
       SET status='CANCELED'
       WHERE id=$1
       RETURNING
         id,
         project_id,
         title,
         start_at,
         end_at,
         due_date,
         COALESCE(date, start_at, due_date) AS date,
         notes,
         status,
         created_at`,
      [id]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE (GC only)
app.delete("/schedule-item/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ error: "Invalid id" });

    const { rows: existing } = await pool.query(
      `SELECT id, project_id FROM public.schedule_items WHERE id=$1`,
      [id]
    );
    const item = existing[0];
    if (!item) return res.status(404).json({ error: "Schedule item not found" });

    const mem = await getMembership(item.project_id, req.userId);
    if (!mem) return res.status(403).json({ error: "Not in project" });
    if (!isGcRole(mem.role)) return res.status(403).json({ error: "GC only" });

    await pool.query(`DELETE FROM public.schedule_items WHERE id=$1`, [id]);
    res.json({ ok: true, deleted: id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------------
// PLANS ROUTES
// ----------------------
app.get("/projects/:projectId/plans", requireAuth, requireProjectMember, async (req, res) => {
  try {
    const { projectId } = req.params;
    const store = await readPlans(projectId);

    const sheets = store.sheets.map((s) => ({ ...s, current: computeCurrentRevision(s) }));
    res.json({ projectId, sheets });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/projects/:projectId/plans/search", requireAuth, requireProjectMember, async (req, res) => {
  try {
    const { projectId } = req.params;
    const q = req.query.q || "";
    const discipline = req.query.discipline || "";

    const store = await readPlans(projectId);
    const results = searchSheets(store, q, discipline);

    res.json({ projectId, sheets: results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get(
  "/projects/:projectId/plans/sheets/:sheetId",
  requireAuth,
  requireProjectMember,
  async (req, res) => {
    try {
      const { projectId, sheetId } = req.params;
      const store = await readPlans(projectId);

      const sheet = getSheet(store, sheetId);
      if (!sheet) return res.status(404).json({ error: "Sheet not found" });

      res.json({ ...sheet, current: computeCurrentRevision(sheet) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

app.post(
  "/projects/:projectId/plans/upload",
  requireAuth,
  requireProjectMember,
  planUpload.single("pdf"),
  async (req, res) => {
    try {
      const { projectId } = req.params;

      if (!isGcRole(req.projectRole)) return res.status(403).json({ error: "Only GC can upload plans" });
      if (!req.file) return res.status(400).json({ error: "Missing PDF file (field name: pdf)" });

      const sheetNo = req.body.sheetNo;
      const sheetId = req.body.sheetId;
      const title = req.body.title;
      const discipline = req.body.discipline;

      const makeCurrent = String(req.body.makeCurrent || "").toLowerCase() === "true";
      const status = makeCurrent ? "Current" : "Pending";

      const store = await readPlans(projectId);
      const sheet = upsertSheet(store, { sheetId, sheetNo, title, discipline });

      const fileUrl = `/uploads/plans/${projectId}/${req.file.filename}`;
      const revDate = new Date().toISOString().slice(0, 10);

      const rev = nextRev(sheet);
      addRevisionToSheet(sheet, { rev, revDate, status, fileUrl });

      await writePlans(projectId, store);

      res.status(201).json({
        ok: true,
        projectId,
        sheetId: sheet.sheetId,
        sheet: { ...sheet, current: computeCurrentRevision(sheet) },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  }
);

// ----------------------
// PUNCH ROUTES
// ----------------------
const PUNCH_STATUS = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
  VERIFIED: "VERIFIED",
  CLOSED: "CLOSED",
};

function normalizePunchStatus(s) {
  const v = String(s || "").trim().toUpperCase();
  if (v === "PENDING_VERIFICATION") return PUNCH_STATUS.DONE;
  return v || PUNCH_STATUS.OPEN;
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

function requireIssueAccess(mem, issue) {
  const isGC = isGcRole(mem.role);
  if (isGC) return { ok: true, isGC: true };

  if (!issue.assigned_company_id) {
    return { ok: false, status: 403, error: "Unassigned item (GC only for now)" };
  }

  if (mem.company_id !== issue.assigned_company_id) {
    return { ok: false, status: 403, error: "Not your company’s item" };
  }

  return { ok: true, isGC: false };
}

const getPunchForProject = async (req, res) => {
  try {
    const { projectId } = req.params;

    const mem = await getMembership(projectId, req.userId);
    if (!mem) return res.status(403).json({ error: "Not in project" });

    let result;

    if (isGcRole(mem.role)) {
      result = await pool.query(
        `SELECT
           i.*,
           COALESCE(COUNT(pp.id), 0) AS photo_count
         FROM issues i
         LEFT JOIN punch_photos pp ON pp.punch_id = i.id
         WHERE i.project_id = $1
         GROUP BY i.id
         ORDER BY i.created_at DESC`,
        [projectId]
      );
    } else {
      result = await pool.query(
        `SELECT
           i.*,
           COALESCE(COUNT(pp.id), 0) AS photo_count
         FROM issues i
         LEFT JOIN punch_photos pp ON pp.punch_id = i.id
         WHERE i.project_id = $1 AND i.assigned_company_id = $2
         GROUP BY i.id
         ORDER BY i.created_at DESC`,
        [projectId, mem.company_id]
      );
    }

    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
};

const createPunchForProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title, location, trade, assigned_company_id, due_date } = req.body || {};

    const mem = await getMembership(projectId, req.userId);
    if (!mem || !isGcRole(mem.role)) {
      return res.status(403).json({ error: "Only GC can create items" });
    }

    const insert = await pool.query(
      `INSERT INTO issues
       (project_id, title, location, trade, status, created_by_user_id, assigned_company_id, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        projectId,
        title,
        location,
        trade,
        PUNCH_STATUS.OPEN,
        req.userId,
        assigned_company_id,
        due_date,
      ]
    );

    res.json(insert.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
};

app.get("/punch/:projectId", requireAuth, getPunchForProject);
app.get("/projects/:projectId/punch", requireAuth, getPunchForProject);

app.post("/punch/:projectId", requireAuth, createPunchForProject);
app.post("/projects/:projectId/punch", requireAuth, createPunchForProject);

app.post("/punch/:issueId/start", requireAuth, async (req, res) => {
  try {
    const { issueId } = req.params;
    if (!isUuid(issueId)) return res.status(400).json({ error: "Invalid issueId" });

    const issue = await getIssue(issueId);
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    const mem = await getMembership(issue.project_id, req.userId);
    if (!mem) return res.status(403).json({ error: "Not in project" });

    const access = requireIssueAccess(mem, issue);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const cur = normalizePunchStatus(issue.status);

    if (cur === PUNCH_STATUS.CLOSED) return res.status(400).json({ error: "Already closed" });
    if (cur === PUNCH_STATUS.VERIFIED) return res.status(400).json({ error: "Already verified" });

    if (cur === PUNCH_STATUS.IN_PROGRESS) {
      const row = await pool.query(`SELECT * FROM issues WHERE id=$1`, [issueId]);
      return res.json(row.rows[0]);
    }

    if (cur !== PUNCH_STATUS.OPEN) {
      return res.status(409).json({ error: "Invalid state for start", currentStatus: issue.status });
    }

    const updated = await pool.query(
      `UPDATE issues
       SET status=$2
       WHERE id=$1
       RETURNING *`,
      [issueId, PUNCH_STATUS.IN_PROGRESS]
    );

    res.json(updated.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/punch/:issueId/complete", requireAuth, async (req, res) => {
  try {
    const { issueId } = req.params;
    if (!isUuid(issueId)) return res.status(400).json({ error: "Invalid issueId" });

    const issue = await getIssue(issueId);
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    const mem = await getMembership(issue.project_id, req.userId);
    if (!mem) return res.status(403).json({ error: "Not in project" });

    const access = requireIssueAccess(mem, issue);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const cur = normalizePunchStatus(issue.status);

    if (cur === PUNCH_STATUS.DONE) {
      const row = await pool.query(`SELECT * FROM issues WHERE id=$1`, [issueId]);
      return res.json(row.rows[0]);
    }

    if (cur === PUNCH_STATUS.VERIFIED || cur === PUNCH_STATUS.CLOSED) {
      return res.status(400).json({ error: "Already verified/closed" });
    }

    if (cur !== PUNCH_STATUS.OPEN && cur !== PUNCH_STATUS.IN_PROGRESS) {
      return res.status(409).json({ error: "Invalid state for complete", currentStatus: issue.status });
    }

    const updated = await pool.query(
      `UPDATE issues
       SET status=$2, completed_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [issueId, PUNCH_STATUS.DONE]
    );
    res.json(updated.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/punch/:issueId/verify", requireAuth, async (req, res) => {
  try {
    const { issueId } = req.params;
    if (!isUuid(issueId)) return res.status(400).json({ error: "Invalid issueId" });

    const issue = await getIssue(issueId);
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    const mem = await getMembership(issue.project_id, req.userId);
    if (!mem) return res.status(403).json({ error: "Not in project" });

    if (!isGcRole(mem.role)) return res.status(403).json({ error: "Only GC can verify items" });

    const cur = normalizePunchStatus(issue.status);

    if (cur === PUNCH_STATUS.VERIFIED) {
      const row = await pool.query(`SELECT * FROM issues WHERE id=$1`, [issueId]);
      return res.json(row.rows[0]);
    }

    if (cur === PUNCH_STATUS.CLOSED) return res.status(400).json({ error: "Already closed" });

    if (cur !== PUNCH_STATUS.DONE) {
      return res.status(409).json({
        error: "Item must be DONE before it can be VERIFIED",
        currentStatus: issue.status,
      });
    }

    const updated = await pool.query(
      `UPDATE issues
       SET status=$2, closed_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [issueId, PUNCH_STATUS.VERIFIED]
    );
    res.json(updated.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/punch/:issueId/close", requireAuth, async (req, res) => {
  try {
    const { issueId } = req.params;
    if (!isUuid(issueId)) return res.status(400).json({ error: "Invalid issueId" });

    const issue = await getIssue(issueId);
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    const mem = await getMembership(issue.project_id, req.userId);
    if (!mem) return res.status(403).json({ error: "Not in project" });

    if (!isGcRole(mem.role)) return res.status(403).json({ error: "Only GC can close items" });

    const cur = normalizePunchStatus(issue.status);

    if (cur === PUNCH_STATUS.CLOSED) {
      const row = await pool.query(`SELECT * FROM issues WHERE id=$1`, [issueId]);
      return res.json(row.rows[0]);
    }

    if (cur !== PUNCH_STATUS.VERIFIED) {
      return res.status(409).json({
        error: "Item must be VERIFIED before it can be CLOSED",
        currentStatus: issue.status,
      });
    }

    const updated = await pool.query(
      `UPDATE issues
       SET status=$2
       WHERE id=$1
       RETURNING *`,
      [issueId, PUNCH_STATUS.CLOSED]
    );
    res.json(updated.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/punch/:issueId", requireAuth, async (req, res) => {
  try {
    const { issueId } = req.params;
    if (!isUuid(issueId)) return res.status(400).json({ error: "Invalid issueId" });

    const issue = await getIssue(issueId);
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    const mem = await getMembership(issue.project_id, req.userId);
    if (!mem) return res.status(403).json({ error: "Not in project" });

    if (!isGcRole(mem.role)) return res.status(403).json({ error: "Only GC can delete items" });

    await pool.query(`DELETE FROM punch_photos WHERE punch_id = $1`, [issueId]);
    await pool.query(`DELETE FROM issues WHERE id = $1`, [issueId]);

    res.json({ ok: true, deleted: issueId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/punch/:issueId/photo", requireAuth, upload.single("photo"), async (req, res) => {
  try {
    const { issueId } = req.params;

    if (!isUuid(issueId)) return res.status(400).json({ error: "Invalid issueId" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const issue = await getIssue(issueId);
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    const mem = await getMembership(issue.project_id, req.userId);
    if (!mem) return res.status(403).json({ error: "Not in project" });

    const access = requireIssueAccess(mem, issue);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const filePath = `/uploads/${req.file.filename}`;

    const { rows } = await pool.query(
      `INSERT INTO punch_photos
        (punch_id, file_path, original_name, mime_type, size_bytes, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [issueId, filePath, req.file.originalname, req.file.mimetype, req.file.size, req.userId]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/punch/:issueId/photos", requireAuth, async (req, res) => {
  try {
    const { issueId } = req.params;

    if (!isUuid(issueId)) return res.status(400).json({ error: "Invalid issueId" });

    const issue = await getIssue(issueId);
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    const mem = await getMembership(issue.project_id, req.userId);
    if (!mem) return res.status(403).json({ error: "Not in project" });

    const access = requireIssueAccess(mem, issue);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const { rows } = await pool.query(
      `SELECT id, file_path, original_name, mime_type, size_bytes, created_at
       FROM punch_photos
       WHERE punch_id = $1
       ORDER BY created_at DESC`,
      [issueId]
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------------
// Error Handler
// ----------------------
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Server error" });
});

// ----------------------
// Start server
// ----------------------
const server = app.listen(PORT, HOST, () => {
  console.log(`API listening on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
});

process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  server.close(() => console.log("HTTP server closed"));
  try {
    await pool.end();
    console.log("DB pool closed");
  } catch (e) {
    console.error("DB pool close error:", e);
  }
  process.exit(0);
});