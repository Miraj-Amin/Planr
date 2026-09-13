-- ============================================================
-- PLANR — SEED DATA
-- Paste this entire block into Supabase SQL Editor and run once.
-- This loads the Francis Group CLM demo project.
-- ============================================================

-- People
insert into people (id, name, initials, color, is_client, org) values
  ('aaaa0001-0000-0000-0000-000000000001', 'Miraj Amin',        'MA', '#5B7FCC', false, 'Solusign'),
  ('aaaa0002-0000-0000-0000-000000000002', 'Sofian Saoudi',     'SS', '#5B9E7F', false, 'Solusign'),
  ('aaaa0003-0000-0000-0000-000000000003', 'Oleksandr Mezko',   'OM', '#9B67C2', false, 'Solusign'),
  ('aaaa0004-0000-0000-0000-000000000004', 'Francis Delacroix', 'FD', '#C47B3E', true,  'Francis Group'),
  ('aaaa0005-0000-0000-0000-000000000005', 'Elena Ruiz',        'ER', '#D4716A', true,  'Francis Group');

-- Projects
insert into projects (id, name, client_org, status, blueprint) values
  ('b0000001-0000-0000-0000-000000000001', 'Francis Group — CLM Rollout',      'Francis Group', 'active', 'clm-rollout'),
  ('b0000002-0000-0000-0000-000000000002', 'Internal — PM Operating System',   'Solusign',      'active', null);

-- Deliverables (for pr1)
insert into deliverables (id, project_id, name, status, due_date, sort_order) values
  ('cccc0001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'Requirements pack',      'in-progress', '2026-09-22', 1),
  ('cccc0002-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000001', 'Process flowchart pack', 'in-progress', '2026-10-01', 2),
  ('cccc0003-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000001', 'Configuration playbook', 'todo',        '2026-10-16', 3);

-- Sprints (for pr1)
insert into sprints (id, project_id, name, start_date, end_date, is_active) values
  ('dddd0001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'Sprint 6 · 14–25 Sep',    '2026-09-14', '2026-09-25', true),
  ('dddd0002-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000001', 'Sprint 7 · 28 Sep–9 Oct', '2026-09-28', '2026-10-09', false);

-- Tasks (project pr1) — phases, deliverables, tasks, milestones, follow-ups
insert into tasks
  (id, project_id, parent_id, deliverable_id, sprint_id, type, name, status, owner_id,
   start_date, end_date, duration_days, is_scheduled_manually,
   effort_min, logged_min, progress, priority, flagged, sort_order)
values
  -- Phase 1
  ('eeee0001-0000-0000-0000-000000000001',
   'b0000001-0000-0000-0000-000000000001', null, null, null,
   'phase', 'Discovery & Design', 'in-progress', null,
   '2026-09-14', '2026-10-02', null, false, 0, 0, 65, 'high', false, 1),

  -- Deliverable row for dl1 (Requirements pack)
  ('eeee0002-0000-0000-0000-000000000002',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0001-0000-0000-0000-000000000001',
   'cccc0001-0000-0000-0000-000000000001',
   'dddd0001-0000-0000-0000-000000000001',
   'deliverable', 'Requirements pack', 'in-progress',
   'aaaa0002-0000-0000-0000-000000000002',
   '2026-09-14', '2026-09-22', null, false, 0, 0, 80, 'high', false, 1),

  -- t1: Stakeholder interviews (done)
  ('eeee0003-0000-0000-0000-000000000003',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0002-0000-0000-0000-000000000002',
   'cccc0001-0000-0000-0000-000000000001',
   'dddd0001-0000-0000-0000-000000000001',
   'task', 'Stakeholder interviews', 'done',
   'aaaa0002-0000-0000-0000-000000000002',
   '2026-09-14', '2026-09-16', 3, true, 240, 255, 100, 'high', false, 1),

  -- t2: Current state assessment (in-progress)
  ('eeee0004-0000-0000-0000-000000000004',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0002-0000-0000-0000-000000000002',
   'cccc0001-0000-0000-0000-000000000001',
   'dddd0001-0000-0000-0000-000000000001',
   'task', 'Current state assessment', 'in-progress',
   'aaaa0001-0000-0000-0000-000000000001',
   '2026-09-17', '2026-09-21', 3, false, 240, 120, 50, 'high', false, 2),

  -- Deliverable row for dl2 (Process flowchart pack)
  ('eeee0005-0000-0000-0000-000000000005',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0001-0000-0000-0000-000000000001',
   'cccc0002-0000-0000-0000-000000000002',
   'dddd0001-0000-0000-0000-000000000001',
   'deliverable', 'Process flowchart pack', 'in-progress',
   'aaaa0002-0000-0000-0000-000000000002',
   '2026-09-22', '2026-10-01', null, false, 0, 0, 40, 'high', false, 2),

  -- t3: Swimlane diagrams
  ('eeee0006-0000-0000-0000-000000000006',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0005-0000-0000-0000-000000000005',
   'cccc0002-0000-0000-0000-000000000002',
   'dddd0001-0000-0000-0000-000000000001',
   'task', 'Swimlane diagrams', 'in-progress',
   'aaaa0002-0000-0000-0000-000000000002',
   '2026-09-22', '2026-09-25', 4, false, 240, 180, 60, 'high', false, 1),

  -- t4: Revision pass (flagged for meeting)
  ('eeee0007-0000-0000-0000-000000000007',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0005-0000-0000-0000-000000000005',
   'cccc0002-0000-0000-0000-000000000002',
   'dddd0001-0000-0000-0000-000000000001',
   'task', 'Revision pass after walkthrough', 'todo',
   'aaaa0002-0000-0000-0000-000000000002',
   '2026-09-30', '2026-10-01', 2, false, 120, 0, 0, 'normal', true, 2),

  -- m1: Milestone — scope sign-off
  ('eeee0008-0000-0000-0000-000000000008',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0001-0000-0000-0000-000000000001',
   null, null,
   'milestone', 'Scope & design sign-off', 'todo',
   'aaaa0001-0000-0000-0000-000000000001',
   '2026-10-02', '2026-10-02', 0, false, 0, 0, 0, 'high', false, 3),

  -- Phase 2
  ('eeee0009-0000-0000-0000-000000000009',
   'b0000001-0000-0000-0000-000000000001', null, null, null,
   'phase', 'Platform Configuration', 'todo', null,
   '2026-10-05', '2026-10-30', null, false, 0, 0, 0, 'high', false, 2),

  -- Deliverable row for dl3 (Configuration playbook)
  ('eeee000a-0000-0000-0000-000000000010',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0009-0000-0000-0000-000000000009',
   'cccc0003-0000-0000-0000-000000000003',
   'dddd0002-0000-0000-0000-000000000002',
   'deliverable', 'Configuration playbook', 'todo',
   'aaaa0001-0000-0000-0000-000000000001',
   '2026-10-05', '2026-10-16', null, false, 0, 0, 0, 'high', false, 1),

  -- t5: Data model configuration
  ('eeee000b-0000-0000-0000-000000000011',
   'b0000001-0000-0000-0000-000000000001',
   'eeee000a-0000-0000-0000-000000000010',
   'cccc0003-0000-0000-0000-000000000003',
   'dddd0002-0000-0000-0000-000000000002',
   'task', 'Data model configuration', 'todo',
   'aaaa0001-0000-0000-0000-000000000001',
   '2026-10-05', '2026-10-08', 4, false, 240, 0, 0, 'high', false, 1),

  -- t6: User role mapping (SS dependency on t5)
  ('eeee000c-0000-0000-0000-000000000012',
   'b0000001-0000-0000-0000-000000000001',
   'eeee000a-0000-0000-0000-000000000010',
   'cccc0003-0000-0000-0000-000000000003',
   'dddd0002-0000-0000-0000-000000000002',
   'task', 'User role mapping', 'todo',
   'aaaa0003-0000-0000-0000-000000000003',
   '2026-10-06', '2026-10-07', 2, false, 120, 0, 0, 'normal', false, 2),

  -- m2: Milestone — configuration review
  ('eeee000d-0000-0000-0000-000000000013',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0009-0000-0000-0000-000000000009',
   null, null,
   'milestone', 'Configuration review pass', 'todo',
   'aaaa0001-0000-0000-0000-000000000001',
   '2026-10-30', '2026-10-30', 0, false, 0, 0, 0, 'high', false, 2),

  -- f1: Client follow-up — legal entity list (urgent, overdue signal)
  ('eeee000e-0000-0000-0000-000000000014',
   'b0000001-0000-0000-0000-000000000001',
   null, null, 'dddd0001-0000-0000-0000-000000000001',
   'followup', 'Provide legal entity list and signing authority matrix', 'todo',
   'aaaa0004-0000-0000-0000-000000000004',
   '2026-09-13', '2026-09-17', 1, true, 0, 0, 0, 'urgent', true, 1),

  -- f2: Client follow-up — no due date (the blocker pattern)
  ('eeee000f-0000-0000-0000-000000000015',
   'b0000001-0000-0000-0000-000000000001',
   null, null, 'dddd0001-0000-0000-0000-000000000001',
   'followup', 'Confirm which business units are in phase 1 scope', 'todo',
   'aaaa0005-0000-0000-0000-000000000005',
   '2026-09-12', null, null, true, 0, 0, 0, 'high', true, 2);

-- Dependencies
insert into dependencies (id, project_id, predecessor_id, successor_id, type, lag_days) values
  -- t1 FS-> t2 (interviews done before assessment starts)
  ('ffff0001-0000-0000-0000-000000000001',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0003-0000-0000-0000-000000000003',
   'eeee0004-0000-0000-0000-000000000004', 'FS', 0),
  -- dl1 deliverable FS-> dl2 deliverable
  ('ffff0002-0000-0000-0000-000000000002',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0002-0000-0000-0000-000000000002',
   'eeee0005-0000-0000-0000-000000000005', 'FS', 0),
  -- t2 FS-> t3 (assessment before diagrams)
  ('ffff0003-0000-0000-0000-000000000003',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0004-0000-0000-0000-000000000004',
   'eeee0006-0000-0000-0000-000000000006', 'FS', 0),
  -- t3 FS+2-> t4 (revision starts 2 days after diagrams, after client walkthrough)
  ('ffff0004-0000-0000-0000-000000000004',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0006-0000-0000-0000-000000000006',
   'eeee0007-0000-0000-0000-000000000007', 'FS', 2),
  -- dl2 FS-> m1 (flowcharts done before sign-off)
  ('ffff0005-0000-0000-0000-000000000005',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0005-0000-0000-0000-000000000005',
   'eeee0008-0000-0000-0000-000000000008', 'FS', 0),
  -- phase1 FS-> phase2
  ('ffff0006-0000-0000-0000-000000000006',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0001-0000-0000-0000-000000000001',
   'eeee0009-0000-0000-0000-000000000009', 'FS', 0),
  -- m1 FS-> dl3 deliverable
  ('ffff0007-0000-0000-0000-000000000007',
   'b0000001-0000-0000-0000-000000000001',
   'eeee0008-0000-0000-0000-000000000008',
   'eeee000a-0000-0000-0000-000000000010', 'FS', 0),
  -- t5 SS+1-> t6 (role mapping starts a day after data model)
  ('ffff0008-0000-0000-0000-000000000008',
   'b0000001-0000-0000-0000-000000000001',
   'eeee000b-0000-0000-0000-000000000011',
   'eeee000c-0000-0000-0000-000000000012', 'SS', 1);

-- Demo meeting
insert into meetings (id, project_id, title, date, start_time, duration_min, notes) values
  ('a0011001-0000-0000-0000-000000000001',
   'b0000001-0000-0000-0000-000000000001',
   'Francis Group — weekly delivery call',
   '2026-09-14', '15:00', 55,
   'Carry forward unresolved items. Six of ten items covered last week.');

-- Meeting attendees
insert into meeting_attendees (meeting_id, person_id) values
  ('a0011001-0000-0000-0000-000000000001', 'aaaa0001-0000-0000-0000-000000000001'),
  ('a0011001-0000-0000-0000-000000000001', 'aaaa0002-0000-0000-0000-000000000002'),
  ('a0011001-0000-0000-0000-000000000001', 'aaaa0004-0000-0000-0000-000000000004'),
  ('a0011001-0000-0000-0000-000000000001', 'aaaa0005-0000-0000-0000-000000000005');

-- ============================================================
-- After running this, go to Authentication → Users in Supabase,
-- find your user, copy the UUID, then run the project_members
-- insert that Claude gives you next.
-- ============================================================
