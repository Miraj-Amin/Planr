-- ============================================================
-- 0006_rls.sql — row level security
-- Membership model: a person belongs to projects via project_members.
-- Policies are illustrative; tighten against your auth model.
-- ============================================================

create table project_members (
  project_id uuid references projects(id) on delete cascade,
  user_id    uuid not null,          -- auth.users id
  role       text not null default 'member' check (role in ('owner','member','viewer')),
  primary key (project_id, user_id)
);

alter table projects        enable row level security;
alter table deliverables    enable row level security;
alter table sprints         enable row level security;
alter table tasks           enable row level security;
alter table dependencies    enable row level security;
alter table meetings        enable row level security;
alter table meeting_items   enable row level security;

-- helper: is the current user a member of this project?
create or replace function is_project_member(p uuid)
returns boolean language sql stable security definer as $$
  select exists(
    select 1 from project_members
    where project_id = p and user_id = auth.uid()
  );
$$;

create policy proj_read on projects for select
  using (is_project_member(id));

create policy tasks_rw on tasks for all
  using (is_project_member(project_id))
  with check (is_project_member(project_id));

create policy deliv_rw on deliverables for all
  using (is_project_member(project_id))
  with check (is_project_member(project_id));

create policy sprints_rw on sprints for all
  using (is_project_member(project_id))
  with check (is_project_member(project_id));

create policy deps_rw on dependencies for all
  using (is_project_member(project_id))
  with check (is_project_member(project_id));

create policy meetings_rw on meetings for all
  using (is_project_member(project_id))
  with check (is_project_member(project_id));
