-- ============================================================
-- 0003_dependencies.sql — task dependency graph
-- The four standard precedence relationships, with lag.
-- ============================================================

-- FS  Finish-to-Start : successor starts after predecessor finishes (default)
-- SS  Start-to-Start  : successor starts when predecessor starts
-- FF  Finish-to-Finish: successor finishes when predecessor finishes
-- SF  Start-to-Finish : successor finishes when predecessor starts (rare)
create type dep_type as enum ('FS','SS','FF','SF');

create table dependencies (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  predecessor_id uuid not null references tasks(id) on delete cascade,
  successor_id   uuid not null references tasks(id) on delete cascade,
  type          dep_type not null default 'FS',
  lag_days      int not null default 0,   -- +ve = gap, -ve = overlap (lead)
  created_at    timestamptz not null default now(),

  -- a pair can only relate one way, and never to itself
  constraint dep_distinct check (predecessor_id <> successor_id),
  constraint dep_unique unique (predecessor_id, successor_id)
);

create index deps_project_idx     on dependencies(project_id);
create index deps_predecessor_idx on dependencies(predecessor_id);
create index deps_successor_idx   on dependencies(successor_id);

-- Cycle guard: block a dependency whose successor can already reach
-- the predecessor (which would create a loop in the graph).
create or replace function dep_no_cycle() returns trigger
language plpgsql as $$
declare found boolean;
begin
  with recursive reachable(id) as (
    select successor_id from dependencies where predecessor_id = new.successor_id
    union
    select d.successor_id from dependencies d join reachable r on d.predecessor_id = r.id
  )
  select exists(select 1 from reachable where id = new.predecessor_id) into found;
  if found then
    raise exception 'Dependency would create a cycle (% -> %)',
      new.predecessor_id, new.successor_id;
  end if;
  return new;
end $$;

create trigger deps_cycle_check before insert or update on dependencies
for each row execute function dep_no_cycle();
