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

/* ---------------- CONFIG ---------------- */

const PORT = Number(process.env.PORT || 3005);
const HOST = process.env.HOST || "0.0.0.0";

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");
const PLANS_UPLOAD_ROOT = path.join(UPLOADS_ROOT, "plans");
const DATA_ROOT = path.join(process.cwd(), "data", "projects");

const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET must be set");
  process.exit(1);
}

const ALLOW_DEV_LOGIN =
  String(process.env.ALLOW_DEV_LOGIN || "").toLowerCase() === "true";

/* ---------------- DB ---------------- */

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: DATABASE_URL
    ? {
        rejectUnauthorized: false,
      }
    : false,
});

/* ---------------- MIDDLEWARE ---------------- */

app.use(cors());
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* ---------------- HELPERS ---------------- */

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function safeFilename(name, fallback = "file.bin") {
  const raw = String(name || fallback);
  return raw.replace(/[^\w.\-]+/g, "_");
}

function apiError(res, status, message) {
  return res.status(status).json({ error: message });
}

function signSessionToken(userId) {
  return jwt.sign({ userId, purpose: "session" }, JWT_SECRET, {
    expiresIn: "7d",
  });
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

/* ---------------- ACTIVITY SYSTEM ---------------- */

async function ensureActivityTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_activity (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL,
      user_name text,
      action text,
      item_type text,
      item_title text,
      created_at timestamptz DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS project_activity_project_idx
    ON project_activity(project_id, created_at DESC)
  `);
}

ensureActivityTable().catch((e) =>
  console.error("Activity table init error:", e)
);

async function logActivity(projectId, userName, action, type, title) {
  try {
    await pool.query(
      `INSERT INTO project_activity
       (project_id, user_name, action, item_type, item_title)
       VALUES ($1,$2,$3,$4,$5)`,
      [projectId, userName, action, type, title]
    );
  } catch (e) {
    console.error("Activity log error:", e);
  }
}

/* ---------------- FILE SYSTEM ---------------- */

(async () => {
  await ensureDir(UPLOADS_ROOT);
  await ensureDir(PLANS_UPLOAD_ROOT);
  await ensureDir(DATA_ROOT);
})();

app.use("/uploads", express.static(UPLOADS_ROOT));

/* ---------------- MULTER ---------------- */

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      await ensureDir(UPLOADS_ROOT);
      cb(null, UPLOADS_ROOT);
    },
    filename: (_req, file, cb) => {
      const safe = safeFilename(file.originalname);
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only images allowed"));
    }
    cb(null, true);
  },
});

/* ---------------- HEALTH ---------------- */

app.get("/", (_req, res) => {
  res.send("GC Suite API running");
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
  });
});

/* ---------------- AUTH ---------------- */

app.post("/auth/dev-login", async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production" && !ALLOW_DEV_LOGIN) {
      return apiError(res, 403, "Dev login disabled");
    }

    const { email } = req.body;
    if (!email) return apiError(res, 400, "email required");

    const { rows } = await pool.query(
      "SELECT id,email,name FROM users WHERE lower(email)=lower($1)",
      [email]
    );

    const user = rows[0];
    if (!user) return apiError(res, 404, "User not found");

    const token = signSessionToken(user.id);

    res.json({ token, user });
  } catch (e) {
    console.error(e);
    apiError(res, 500, "Server error");
  }
});

/* ---------------- PROJECTS ---------------- */

app.get("/projects", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id,p.name,p.location
     FROM projects p
     JOIN project_members pm ON pm.project_id=p.id
     WHERE pm.user_id=$1
     ORDER BY p.name`,
    [req.userId]
  );

  res.json(rows);
});

/* ---------------- ACTIVITY ROUTE ---------------- */

app.get("/projects/:projectId/activity", requireAuth, async (req, res) => {
  const { projectId } = req.params;

  const { rows } = await pool.query(
    `SELECT *
     FROM project_activity
     WHERE project_id=$1
     ORDER BY created_at DESC
     LIMIT 30`,
    [projectId]
  );

  res.json(rows);
});

/* ---------------- SCHEDULE ---------------- */

app.post("/projects/:projectId/schedule", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO schedule_items
       (project_id,title,status)
       VALUES ($1,$2,'OPEN')
       RETURNING *`,
      [projectId, title]
    );

    const item = rows[0];

    await logActivity(projectId, "User", "created", "Schedule Item", title);

    res.json(item);
  } catch (e) {
    console.error(e);
    apiError(res, 500, "Schedule create failed");
  }
});

/* ---------------- PUNCH / ISSUES ---------------- */

app.post("/projects/:projectId/punch", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO issues
       (project_id,title,status)
       VALUES ($1,$2,'OPEN')
       RETURNING *`,
      [projectId, title]
    );

    const issue = rows[0];

    await logActivity(projectId, "User", "created", "Issue", issue.title);

    res.json(issue);
  } catch (e) {
    console.error(e);
    apiError(res, 500, "Issue create failed");
  }
});

/* ---------------- PLAN UPLOAD ---------------- */

const planUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, _file, cb) => {
      const dir = path.join(PLANS_UPLOAD_ROOT, req.params.projectId);
      await ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const safe = safeFilename(file.originalname);
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.post(
  "/projects/:projectId/plans/upload",
  requireAuth,
  planUpload.single("pdf"),
  async (req, res) => {
    try {
      const { projectId } = req.params;

      if (!req.file) return apiError(res, 400, "Missing file");

      const fileUrl = `/uploads/plans/${projectId}/${req.file.filename}`;

      await logActivity(
        projectId,
        "User",
        "uploaded",
        "Plan",
        req.file.originalname
      );

      res.json({ ok: true, url: fileUrl });
    } catch (e) {
      console.error(e);
      apiError(res, 500, "Upload failed");
    }
  }
);

/* ---------------- ERROR HANDLER ---------------- */

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Server error" });
});

/* ---------------- SERVER ---------------- */

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 GC Suite API running on port ${PORT}`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received`);

  server.close(() => {
    console.log("HTTP server closed");
  });

  try {
    await pool.end();
    console.log("DB pool closed");
  } catch (e) {
    console.error("DB close error:", e);
  }

  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));