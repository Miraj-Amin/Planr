-- ============================================================
-- Features v4: contacts RLS fix + email column
-- ============================================================

-- 1. Add email column to people (nullable, so existing rows are fine)
alter table people add column if not exists email text;

-- 2. Fix RLS on people so authenticated users can create/read/update contacts.
--    (You cannot save contacts without an INSERT policy.)
drop policy if exists people_select on people;
drop policy if exists people_insert on people;
drop policy if exists people_update on people;

alter table people enable row level security;

create policy people_select on people for select
  to authenticated
  using (true);

create policy people_insert on people for insert
  to authenticated
  with check (true);

create policy people_update on people for update
  to authenticated
  using (true)
  with check (true);
