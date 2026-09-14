-- ============================================================
-- 0002_tasks.sql — the work breakdown structure
-- Project > Phase > Deliverable-linked Task > Sub-task,
-- plus milestones, agenda items and follow-ups.
-- ============================================================

create type task_type as enum
  ('phase','task','milestone','deliverable','agenda','followup','action');

create type task_status as enum
  ('todo','in-progress','blocked','review','done');

create type priority as enum
  ('urgent','high','normal','low');

create table tasks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,

  -- hierarchy: a task's WBS parent (phase or a parent task)
  parent_id      uuid references tasks(id) on delete cascade,

  -- what deliverable this rolls up to (scope anchor)
  deliverable_id uuid references deliverables(id) on delete set null,

  -- which sprint it's scheduled into (null = backlog)
  sprint_id      uuid references sprints(id) on delete set null,

  type           task_type   not null default 'task',
  name           text        not null,
  notes          text,

  status         task_status not null default 'todo',
  owner_id       uuid references people(id) on delete set null,

  -- scheduling. duration_days drives auto-calc when a dependency
  -- moves the start. start/end are the resolved dates.
  start_date     date,
  end_date       date,
  duration_days  int,                         -- working days
  is_scheduled_manually boolean not null default false, -- pins the start against cascade

  effort_min     int  not null default 0,     -- estimated effort (15..480)
  logged_min     int  not null default 0,     -- actual logged
  progress       int  not null default 0 check (progress between 0 and 100),

  priority       priority not null default 'normal',
  flagged        boolean  not null default false,   -- flagged for next meeting
  sort_order     int      not null default 0,
  airtable_id    text unique,
  updated_at     timestamptz not null default now()
);

create index tasks_project_idx    on tasks(project_id);
create index tasks_parent_idx     on tasks(parent_id);
create index tasks_deliverable_idx on tasks(deliverable_id);
create index tasks_sprint_idx     on tasks(sprint_id, status);
create index tasks_owner_horizon_idx on tasks(owner_id, end_date);

-- keep updated_at fresh
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger tasks_touch before update on tasks
for each row execute function touch_updated_at();
