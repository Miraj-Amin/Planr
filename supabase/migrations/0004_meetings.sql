-- ============================================================
-- 0004_meetings.sql — meetings + carry-forward item links
-- ============================================================

create type item_kind as enum ('agenda','followup');

create table meetings (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  title        text not null,
  date         date not null,
  start_time   time not null default '09:00',
  duration_min int  not null default 55,
  notes        text,
  airtable_id  text unique
);
create index meetings_project_idx on meetings(project_id, date);

create table meeting_attendees (
  meeting_id uuid references meetings(id) on delete cascade,
  person_id  uuid references people(id)   on delete cascade,
  primary key (meeting_id, person_id)
);

-- One item (backed by a task) can appear in many meetings.
create table meeting_items (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references tasks(id) on delete cascade,
  kind         item_kind not null,
  resolved     boolean not null default false,
  carried_from uuid references meetings(id) on delete set null,
  channel      text
);
create index meeting_items_task_idx on meeting_items(task_id);

create table meeting_item_links (
  meeting_item_id uuid references meeting_items(id) on delete cascade,
  meeting_id      uuid references meetings(id)      on delete cascade,
  id              uuid primary key default gen_random_uuid(),
  unique (meeting_item_id, meeting_id)
);
