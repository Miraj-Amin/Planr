-- ============================================================
-- 0005_views_functions.sql — horizon, rollups, blocker view
-- ============================================================

-- Horizon: due today or within N days, not done.
create or replace function horizon_tasks(p_days int default 7)
returns setof tasks language sql stable as $$
  select * from tasks
  where status <> 'done'
    and end_date is not null
    and end_date between current_date and current_date + p_days
  order by end_date, priority;
$$;

-- Client-owned items with no agreed date — the blocker pattern.
create or replace view client_no_date as
  select t.*
  from tasks t
  join people p on p.id = t.owner_id
  where p.is_client and t.end_date is null and t.status <> 'done';

-- Deliverable roll-up: dates, effort and progress from child tasks.
create or replace view deliverable_rollup as
  select
    d.id                                   as deliverable_id,
    d.project_id,
    d.name,
    min(t.start_date)                      as start_date,
    max(t.end_date)                        as end_date,
    coalesce(sum(t.effort_min),0)          as effort_min,
    coalesce(sum(t.logged_min),0)          as logged_min,
    case when count(t.id)=0 then 0
         else round(avg(t.progress)) end   as progress,
    count(t.id) filter (where t.status='done') as done_count,
    count(t.id)                            as task_count
  from deliverables d
  left join tasks t on t.deliverable_id = d.id and t.type not in ('agenda','followup')
  group by d.id;

-- Effort burn per project: estimate vs logged (over-budget signal).
create or replace view project_effort as
  select
    project_id,
    sum(effort_min)  as estimated_min,
    sum(logged_min)  as logged_min,
    sum(logged_min) - sum(effort_min) as variance_min
  from tasks
  where type in ('task','deliverable')
  group by project_id;
