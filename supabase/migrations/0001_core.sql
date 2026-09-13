-- ============================================================
-- 0001_core.sql — people, projects, deliverables, sprints
-- ============================================================
create extension if not exists "pgcrypto";

create table people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  initials    text not null,
  color       text not null,
  is_client   boolean not null default false,
  org         text,
  created_at  timestamptz not null default now()
);

create table projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  client_org  text,
  status      text not null default 'active'
              check (status in ('active','on-hold','closed')),
  blueprint   text,                -- which blueprint this was seeded from
  created_at  timestamptz not null default now()
);

create table deliverables (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  description text,
  status      text not null default 'todo'
              check (status in ('todo','in-progress','blocked','review','done')),
  due_date    date,
  sort_order  int not null default 0,
  airtable_id text unique
);
create index deliverables_project_idx on deliverables(project_id);

create table sprints (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  is_active   boolean not null default false
);
create index sprints_project_idx on sprints(project_id);
