-- ============================================================
-- Features v12: Hierarchical template structure
-- Adds parent_id (self-reference) and type to template_tasks so templates
-- can express Phase → Task/Milestone → Deliverable hierarchy, mirroring
-- how a real project plan is structured.
-- ============================================================

alter table template_tasks
  add column if not exists parent_id uuid references template_tasks(id) on delete cascade;

alter table template_tasks
  add column if not exists type text default 'task';

create index if not exists template_tasks_parent_idx on template_tasks(parent_id);

-- Any existing rows without a type default to 'task' so they still edit sanely.
update template_tasks set type = 'task' where type is null;
