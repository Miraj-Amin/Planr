-- ============================================================
-- Features v7: focus_order for Focus view manual ordering
-- ============================================================
-- The focus_order lets users reorder tasks WITHIN the Focus view
-- without affecting sort_order used by the Plan grid.
-- Null values fall back to date-based ordering.

alter table tasks add column if not exists focus_order integer;

-- Small index for quick sort in queries
create index if not exists tasks_focus_order_idx on tasks(focus_order) where focus_order is not null;
