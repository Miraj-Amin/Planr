-- ============================================================
-- PLANR — RLS FIX + PROJECT INSERT POLICY
-- Run this in Supabase SQL Editor.
-- Fixes: new projects and tasks not persisting after refresh.
-- ============================================================

-- 1. Allow authenticated users to create projects
create policy proj_insert on projects for insert
  with check (auth.uid() is not null);

-- 2. Allow project members to update projects
create policy proj_update on projects for update
  using (is_project_member(id))
  with check (is_project_member(id));

-- 3. Allow project members to delete projects
create policy proj_delete on projects for delete
  using (is_project_member(id));

-- 4. Allow project members to insert into sprints/deliverables
--    (already handled by existing policies, but add explicit insert)
create policy sprints_insert on sprints for insert
  with check (is_project_member(project_id));

create policy deliverables_insert on deliverables for insert
  with check (is_project_member(project_id));

-- 5. project_members: let users add themselves as owner of their own new projects
alter table project_members enable row level security;

create policy pm_read on project_members for select
  using (user_id = auth.uid());

create policy pm_insert on project_members for insert
  with check (user_id = auth.uid());

create policy pm_delete on project_members for delete
  using (user_id = auth.uid());
