-- Preflight database schema (Supabase / Postgres)
--
-- RLS NOTES (policies to be added when auth is wired):
--   * Enable RLS on every table (done below).
--   * profiles: users can read/update only their own row.
--   * projects: owners can CRUD rows where owner_id = auth.uid().
--   * runs: readable/writable through the owning project (owner_id = auth.uid()).
--   * findings: readable/writable through the owning run's project.
--   * credit_ledger: users can read only their own rows; writes happen
--     server-side with the service_role key (never from the client).

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  app_url text not null,
  github_repo text, -- "owner/repo" of the connected repository
  created_at timestamptz not null default now()
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  status text not null default 'queued', -- queued | running | done | failed
  agents int not null default 1,
  started_at timestamptz,
  finished_at timestamptz
);

create table findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  step text not null, -- description of the test step that failed
  severity text not null default 'info', -- info | warning | error | critical
  screenshot_url text,
  console_errors jsonb not null default '[]'::jsonb,
  root_cause text, -- filled in by the diagnosing agent
  status text not null default 'open' -- open | fixing | fixed | dismissed
);

create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  delta int not null, -- positive = granted, negative = spent
  reason text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table projects enable row level security;
alter table runs enable row level security;
alter table findings enable row level security;
alter table credit_ledger enable row level security;
