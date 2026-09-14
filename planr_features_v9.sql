-- Allow authenticated users to delete people (needed by Contacts delete button)
drop policy if exists people_delete on people;

create policy people_delete on people for delete
  to authenticated
  using (true);
