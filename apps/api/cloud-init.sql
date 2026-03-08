CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------
-- Core
-- ----------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('GC','SUB','VENDOR','AE','OWNER'))
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  role TEXT NOT NULL CHECK (
    role IN (
      'GC_ADMIN','GC_PM','SUPER',
      'SUB_PM','SUB_FOREMAN',
      'AE_ADMIN','AE_REVIEWER','AE_VIEWER',
      'VIEWER'
    )
  ),
  PRIMARY KEY (project_id, user_id)
);

-- ----------------------
-- RFIs
-- ----------------------
CREATE TABLE IF NOT EXISTS rfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number INT NOT NULL,
  subject TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN','ANSWERED','CLOSED')),
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  assigned_to_user_id UUID REFERENCES users(id),
  due_date DATE,
  answered_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, number)
);

CREATE TABLE IF NOT EXISTS rfi_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfi_id UUID NOT NULL REFERENCES rfis(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  message_type TEXT NOT NULL CHECK (message_type IN ('COMMENT','RESPONSE','SYSTEM')),
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ----------------------
-- Plans
-- ----------------------
CREATE TABLE IF NOT EXISTS plan_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  folder TEXT NOT NULL CHECK (folder IN ('DRAWINGS','SPECS','ADDENDA','ASI')),
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  version_label TEXT,
  uploaded_by_user_id UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  note TEXT,
  share_code TEXT NOT NULL DEFAULT encode(gen_random_bytes(9), 'hex'),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_distribution_files (
  distribution_id UUID REFERENCES plan_distributions(id) ON DELETE CASCADE,
  plan_file_id UUID REFERENCES plan_files(id) ON DELETE CASCADE,
  PRIMARY KEY (distribution_id, plan_file_id)
);

CREATE TABLE IF NOT EXISTS plan_distribution_targets (
  distribution_id UUID REFERENCES plan_distributions(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (distribution_id, company_id)
);

CREATE TABLE IF NOT EXISTS plan_acknowledgments (
  distribution_id UUID REFERENCES plan_distributions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMP NOT NULL,
  PRIMARY KEY (distribution_id, user_id)
);

-- ----------------------
-- Submittals
-- ----------------------
CREATE TABLE IF NOT EXISTS submittals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  spec_section TEXT NOT NULL,
  title TEXT NOT NULL,
  trade TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'DRAFT','SUBMITTED','IN_REVIEW',
      'APPROVED','APPROVED_AS_NOTED',
      'REVISE_RESUBMIT','REJECTED','VOID'
    )
  ),
  ball_in_court TEXT NOT NULL CHECK (ball_in_court IN ('SUB','GC','AE')),
  required_by DATE,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  assigned_company_id UUID REFERENCES companies(id),
  ae_reviewer_user_id UUID REFERENCES users(id),
  ae_reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submittal_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submittal_id UUID NOT NULL REFERENCES submittals(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID NOT NULL REFERENCES users(id),
  file_url TEXT NOT NULL,
  note TEXT,
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submittal_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submittal_id UUID NOT NULL REFERENCES submittals(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,
  reviewed_file_url TEXT,
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ----------------------
-- Issues / Punch
-- ----------------------
CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  trade TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  assigned_company_id UUID REFERENCES companies(id),
  due_date DATE,
  completed_at TIMESTAMP,
  closed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE issues
  ALTER COLUMN assigned_company_id DROP NOT NULL;

UPDATE issues
SET status = CASE
  WHEN upper(status) = 'PENDING_VERIFICATION' THEN 'DONE'
  WHEN upper(status) IN ('OPEN','IN_PROGRESS','DONE','VERIFIED','CLOSED') THEN upper(status)
  ELSE 'OPEN'
END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'issues_status_check'
  ) THEN
    ALTER TABLE issues DROP CONSTRAINT issues_status_check;
  END IF;

  ALTER TABLE issues
    ADD CONSTRAINT issues_status_check
    CHECK (status IN ('OPEN','IN_PROGRESS','DONE','VERIFIED','CLOSED'));
END $$;

CREATE TABLE IF NOT EXISTS punch_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  punch_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS issue_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ----------------------
-- Schedule
-- ----------------------
CREATE TABLE IF NOT EXISTS schedule_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date DATE NULL,
  start_at DATE NULL,
  end_at DATE NULL,
  due_date DATE NULL,
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_by_user_id UUID NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

UPDATE schedule_items
SET status = CASE
  WHEN status IS NULL OR btrim(status) = '' THEN 'OPEN'
  WHEN upper(status) IN ('OPEN') THEN 'OPEN'
  WHEN upper(status) IN ('DONE','COMPLETE','COMPLETED','FINISHED') THEN 'DONE'
  WHEN upper(status) IN ('VERIFIED','VERIFY') THEN 'VERIFIED'
  WHEN upper(status) IN ('CANCELED','CANCELLED','CANCEL') THEN 'CANCELED'
  ELSE 'OPEN'
END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'schedule_items_status_check'
  ) THEN
    ALTER TABLE schedule_items DROP CONSTRAINT schedule_items_status_check;
  END IF;

  ALTER TABLE schedule_items
    ADD CONSTRAINT schedule_items_status_check
    CHECK (status IN ('OPEN','DONE','VERIFIED','CANCELED'));
END $$;

CREATE INDEX IF NOT EXISTS schedule_items_project_id_idx
  ON schedule_items(project_id);

CREATE INDEX IF NOT EXISTS schedule_items_project_date_idx
  ON schedule_items(project_id, date);

CREATE INDEX IF NOT EXISTS schedule_items_project_start_at_idx
  ON schedule_items(project_id, start_at);

-- ----------------------
-- Pay Apps
-- ----------------------
CREATE TABLE IF NOT EXISTS pay_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMP,
  approved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pay_app_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_app_id UUID NOT NULL REFERENCES pay_apps(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  scheduled_value NUMERIC(12,2) NOT NULL,
  percent_complete NUMERIC(5,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS pay_app_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_app_id UUID NOT NULL REFERENCES pay_apps(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID NOT NULL REFERENCES users(id),
  file_type TEXT NOT NULL CHECK (file_type IN ('INVOICE','LIEN_WAIVER','CO_BACKUP','OTHER')),
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ----------------------
-- Seed data for login/testing
-- ----------------------
INSERT INTO companies (id, name, type)
VALUES ('5ebfa111-1111-4111-8111-111111111111', 'Altech Inc.', 'GC')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, name)
VALUES ('11111111-1111-4111-8111-111111111111', 'b4reel271980@yahoo.com', 'Ashley Reel')
ON CONFLICT (email) DO UPDATE
SET name = EXCLUDED.name;

INSERT INTO projects (id, name, location)
VALUES ('59ed4a4c-603b-4037-9170-63b3af207044', 'Test Project', 'Texarkana')
ON CONFLICT (id) DO NOTHING;

INSERT INTO project_members (project_id, user_id, company_id, role)
VALUES (
  '59ed4a4c-603b-4037-9170-63b3af207044',
  '11111111-1111-4111-8111-111111111111',
  '5ebfa111-1111-4111-8111-111111111111',
  'GC_ADMIN'
)
ON CONFLICT (project_id, user_id) DO NOTHING;