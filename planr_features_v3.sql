-- ============================================================
-- Features v3: contacts + meeting improvements
-- ============================================================

-- Project → contacts mapping
-- Internal people (is_client=false) don't need entries — they're visible everywhere
-- Client people are linked to specific projects via this table
create table if not exists project_contacts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  person_id   uuid not null references people(id)   on delete cascade,
  created_at  timestamptz not null default now(),
  unique (project_id, person_id)
);

create index if not exists project_contacts_project_idx on project_contacts(project_id);
create index if not exists project_contacts_person_idx  on project_contacts(person_id);

-- RLS: same pattern as other project-scoped tables
alter table project_contacts enable row level security;

create policy pc_select on project_contacts for select
  using (is_project_member(project_id));
create policy pc_insert on project_contacts for insert
  with check (is_project_member(project_id));
create policy pc_delete on project_contacts for delete
  using (is_project_member(project_id));
