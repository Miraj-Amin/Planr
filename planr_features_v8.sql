-- ============================================================
-- Features v8: separate "kind" (what the item IS) from "on agenda" 
-- (whether it's on THIS meeting's agenda). An action can be on
-- the agenda in one meeting and not in another.
-- ============================================================

-- 1. Add 'action' to both enums (Postgres won't let us rename atomically).
--    'agenda' remains for legacy data — we'll migrate rows to 'action'.
alter type task_type add value if not exists 'action';
alter type item_kind add value if not exists 'action';

-- Postgres requires the ADD VALUE to be committed before it's usable.
-- COMMIT ends this statement's tx; the UPDATE below runs in a fresh one.
commit;

-- 2. Add on_agenda to meeting_item_links (per-meeting flag)
alter table meeting_item_links
  add column if not exists on_agenda boolean not null default false;

-- 3. Migrate existing rows:
--    - All existing 'agenda' items become 'action' (their intrinsic kind)
--    - Every link belonging to those items gets on_agenda=true 
--      (preserves the current behaviour that they appear in the agenda section)
update meeting_item_links
  set on_agenda = true
  where meeting_item_id in (
    select id from meeting_items where kind = 'agenda'
  );

update meeting_items set kind = 'action' where kind = 'agenda';
update tasks          set type = 'action' where type = 'agenda';
