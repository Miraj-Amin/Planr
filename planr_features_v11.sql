-- ============================================================
-- Features v11: Excel template import + RAID log + extended fields
-- ============================================================

-- ── New fields on tasks ─────────────────────────────────────
alter table tasks add column if not exists wbs                     text;
alter table tasks add column if not exists workstream              text;
alter table tasks add column if not exists accountable_id          uuid references people(id) on delete set null;
alter table tasks add column if not exists duration_workdays       integer;
alter table tasks add column if not exists start_offset_workdays   integer;
alter table tasks add column if not exists acceptance_criteria     text;
alter table tasks add column if not exists key_dependency          text;
alter table tasks add column if not exists rag                     text check (rag in ('green','amber','red','blue')) default 'green';
alter table tasks add column if not exists is_milestone            boolean not null default false;

-- ── New fields on projects ──────────────────────────────────
alter table projects add column if not exists technical_lead_id       uuid references people(id) on delete set null;
alter table projects add column if not exists business_owner_id       uuid references people(id) on delete set null;
alter table projects add column if not exists executive_sponsor_id    uuid references people(id) on delete set null;
alter table projects add column if not exists delivery_method         text;
alter table projects add column if not exists target_go_live_date     date;
alter table projects add column if not exists hypercare_duration_days integer default 10;
alter table projects add column if not exists objective               text;
alter table projects add column if not exists status_date             date;

-- ── RAID log ────────────────────────────────────────────────
create table if not exists risks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  code         text,
  type         text check (type in ('risk','issue','assumption','dependency')) default 'risk',
  description  text,
  cause        text,
  impact       text,
  probability  text check (probability in ('low','medium','high','critical')) default 'medium',
  severity     text check (severity in ('low','medium','high','critical')) default 'medium',
  rag          text check (rag in ('green','amber','red','blue')) default 'green',
  owner_id     uuid references people(id) on delete set null,
  mitigation   text,
  target_date  date,
  status       text check (status in ('open','monitoring','closed','accepted')) default 'open',
  escalation   text,
  date_raised  date default current_date,
  date_closed  date,
  sort_order   bigint default 0,
  created_at   timestamptz not null default now()
);
create index if not exists risks_project_idx on risks(project_id);

alter table risks enable row level security;
drop policy if exists risks_select on risks;
drop policy if exists risks_insert on risks;
drop policy if exists risks_update on risks;
drop policy if exists risks_delete on risks;
create policy risks_select on risks for select using (is_project_member(project_id));
create policy risks_insert on risks for insert with check (is_project_member(project_id));
create policy risks_update on risks for update using (is_project_member(project_id)) with check (is_project_member(project_id));
create policy risks_delete on risks for delete using (is_project_member(project_id));

-- ── Templates + template tasks ──────────────────────────────
create table if not exists templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  source      text default 'excel_import',   -- excel_import | from_project | manual
  created_by  uuid,
  created_at  timestamptz not null default now()
);

-- Every task-row from the imported plan, in flat form. Phase is stored as text
-- because we don't want template rows to depend on any actual project.
create table if not exists template_tasks (
  id                    uuid primary key default gen_random_uuid(),
  template_id           uuid not null references templates(id) on delete cascade,
  wbs                   text,
  phase                 text,
  workstream            text,
  name                  text not null,
  primary_deliverable   text,
  is_milestone          boolean not null default false,
  owner_role            text,          -- e.g. "Project Manager" — resolved to a person at import time
  accountable_role      text,
  duration_workdays     integer default 1,
  start_offset_workdays integer default 0,
  predecessor_wbs       text,          -- text; parsed at import to a dependency
  key_dependency        text,
  acceptance_criteria   text,
  sort_order            bigint not null default 0
);
create index if not exists template_tasks_template_idx on template_tasks(template_id);

alter table templates      enable row level security;
alter table template_tasks enable row level security;

-- Templates are workspace-wide for authenticated users
drop policy if exists tpl_select on templates;
drop policy if exists tpl_insert on templates;
drop policy if exists tpl_update on templates;
drop policy if exists tpl_delete on templates;
create policy tpl_select on templates for select to authenticated using (true);
create policy tpl_insert on templates for insert to authenticated with check (true);
create policy tpl_update on templates for update to authenticated using (true) with check (true);
create policy tpl_delete on templates for delete to authenticated using (true);

drop policy if exists tt_select on template_tasks;
drop policy if exists tt_insert on template_tasks;
drop policy if exists tt_update on template_tasks;
drop policy if exists tt_delete on template_tasks;
create policy tt_select on template_tasks for select to authenticated using (true);
create policy tt_insert on template_tasks for insert to authenticated with check (true);
create policy tt_update on template_tasks for update to authenticated using (true) with check (true);
create policy tt_delete on template_tasks for delete to authenticated using (true);
