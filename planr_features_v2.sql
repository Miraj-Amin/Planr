-- Add linked_task_id to meetings so we can trace back to the task that spawned it
alter table meetings
  add column if not exists linked_task_id uuid references tasks(id) on delete set null;

create index if not exists meetings_linked_task_idx on meetings(linked_task_id);
