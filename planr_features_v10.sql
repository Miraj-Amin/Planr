-- ============================================================
-- Features v10: task comments with edit history
-- ============================================================

-- Comments themselves
create table if not exists task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  author_id   uuid references people(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists task_comments_task_idx on task_comments(task_id);

-- Edit history: every time body is updated, we insert the PRIOR body into here
create table if not exists task_comment_history (
  id           uuid primary key default gen_random_uuid(),
  comment_id   uuid not null references task_comments(id) on delete cascade,
  body         text not null,           -- the previous body being replaced
  edited_at    timestamptz not null default now(),
  edited_by    uuid references people(id) on delete set null
);

create index if not exists tch_comment_idx on task_comment_history(comment_id);

-- Trigger: on UPDATE of body, log the old value
create or replace function log_comment_edit() returns trigger as $$
begin
  if OLD.body is distinct from NEW.body then
    insert into task_comment_history (comment_id, body, edited_at, edited_by)
    values (OLD.id, OLD.body, now(), NEW.author_id);
    NEW.updated_at := now();
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists tc_log_edit on task_comments;
create trigger tc_log_edit
  before update on task_comments
  for each row execute function log_comment_edit();

-- RLS: same pattern as other project-scoped tables
alter table task_comments        enable row level security;
alter table task_comment_history enable row level security;

drop policy if exists tc_select on task_comments;
drop policy if exists tc_insert on task_comments;
drop policy if exists tc_update on task_comments;
drop policy if exists tc_delete on task_comments;

create policy tc_select on task_comments for select using (
  exists (select 1 from tasks t where t.id = task_comments.task_id and is_project_member(t.project_id))
);
create policy tc_insert on task_comments for insert with check (
  exists (select 1 from tasks t where t.id = task_comments.task_id and is_project_member(t.project_id))
);
create policy tc_update on task_comments for update
  using (exists (select 1 from tasks t where t.id = task_comments.task_id and is_project_member(t.project_id)))
  with check (exists (select 1 from tasks t where t.id = task_comments.task_id and is_project_member(t.project_id)));
create policy tc_delete on task_comments for delete using (
  exists (select 1 from tasks t where t.id = task_comments.task_id and is_project_member(t.project_id))
);

-- History is readable/insertable by anyone who can access the underlying comment's task
drop policy if exists tch_select on task_comment_history;
drop policy if exists tch_insert on task_comment_history;

create policy tch_select on task_comment_history for select using (
  exists (
    select 1 from task_comments tc
    join tasks t on t.id = tc.task_id
    where tc.id = task_comment_history.comment_id and is_project_member(t.project_id)
  )
);
create policy tch_insert on task_comment_history for insert with check (
  exists (
    select 1 from task_comments tc
    join tasks t on t.id = tc.task_id
    where tc.id = task_comment_history.comment_id and is_project_member(t.project_id)
  )
);
