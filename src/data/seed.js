// seed.js — demo data from the 13 Sep Solusign call.
// Field names mirror the SQL columns exactly.
export const SEED = {
  people: [
    { id:'u1', name:'Miraj Amin',       initials:'MA', color:'#5B7FCC', is_client:false, org:'Solusign' },
    { id:'u2', name:'Sofian Saoudi',    initials:'SS', color:'#5B9E7F', is_client:false, org:'Solusign' },
    { id:'u3', name:'Oleksandr Mezko',  initials:'OM', color:'#9B67C2', is_client:false, org:'Solusign' },
    { id:'c1', name:'Francis Delacroix',initials:'FD', color:'#C47B3E', is_client:true,  org:'Francis Group' },
    { id:'c2', name:'Elena Ruiz',       initials:'ER', color:'#D4716A', is_client:true,  org:'Francis Group' },
  ],
  projects: [
    { id:'pr1', name:'Francis Group — CLM Rollout', client_org:'Francis Group', status:'active', blueprint:'clm-rollout' },
    { id:'pr2', name:'Internal — PM Operating System', client_org:'Solusign', status:'active', blueprint:null },
  ],
  deliverables: [
    { id:'dl1', project_id:'pr1', name:'Requirements pack',    status:'in-progress', due_date:'2026-09-22', sort_order:1 },
    { id:'dl2', project_id:'pr1', name:'Process flowchart pack', status:'in-progress', due_date:'2026-10-01', sort_order:2 },
    { id:'dl3', project_id:'pr1', name:'Configuration playbook', status:'todo', due_date:'2026-10-16', sort_order:3 },
  ],
  sprints: [
    { id:'sp1', project_id:'pr1', name:'Sprint 6 · 14–25 Sep', start_date:'2026-09-14', end_date:'2026-09-25', is_active:true },
    { id:'sp2', project_id:'pr1', name:'Sprint 7 · 28 Sep–9 Oct', start_date:'2026-09-28', end_date:'2026-10-09', is_active:false },
  ],
  tasks: [
    { id:'ph1', project_id:'pr1', type:'phase', name:'Discovery & Design', status:'in-progress', progress:65, sort_order:1, start_date:'2026-09-14', end_date:'2026-10-02' },
    { id:'dl1t',project_id:'pr1', type:'deliverable', name:'Requirements pack', deliverable_id:'dl1', parent_id:'ph1', owner_id:'u2', status:'in-progress', progress:80, sort_order:1, start_date:'2026-09-14', end_date:'2026-09-22' },
    { id:'t1', project_id:'pr1', type:'task', name:'Stakeholder interviews', deliverable_id:'dl1', parent_id:'ph1', owner_id:'u2', status:'done', progress:100, sort_order:1, start_date:'2026-09-14', end_date:'2026-09-16', duration_days:3, is_scheduled_manually:true, effort_min:240, logged_min:255 },
    { id:'t2', project_id:'pr1', type:'task', name:'Current state assessment', deliverable_id:'dl1', parent_id:'ph1', owner_id:'u1', status:'in-progress', progress:50, sort_order:2, start_date:'2026-09-17', end_date:'2026-09-21', duration_days:3, effort_min:240, logged_min:120 },
    { id:'dl2t',project_id:'pr1', type:'deliverable', name:'Process flowchart pack', deliverable_id:'dl2', parent_id:'ph1', owner_id:'u2', status:'in-progress', progress:40, sort_order:2, start_date:'2026-09-22', end_date:'2026-10-01' },
    { id:'t3', project_id:'pr1', type:'task', name:'Swimlane diagrams', deliverable_id:'dl2', parent_id:'ph1', owner_id:'u2', status:'in-progress', progress:60, sort_order:1, start_date:'2026-09-22', end_date:'2026-09-25', duration_days:4, effort_min:240, logged_min:180 },
    { id:'t4', project_id:'pr1', type:'task', name:'Revision pass after walkthrough', deliverable_id:'dl2', parent_id:'ph1', owner_id:'u2', status:'todo', progress:0, sort_order:2, start_date:'2026-09-30', end_date:'2026-10-01', duration_days:2, effort_min:120, logged_min:0, flagged:true },
    { id:'m1', project_id:'pr1', type:'milestone', name:'Scope & design sign-off', parent_id:'ph1', owner_id:'u1', status:'todo', progress:0, sort_order:3, end_date:'2026-10-02', duration_days:0 },
    { id:'ph2', project_id:'pr1', type:'phase', name:'Platform Configuration', status:'todo', progress:0, sort_order:2, start_date:'2026-10-05', end_date:'2026-10-30' },
    { id:'dl3t',project_id:'pr1', type:'deliverable', name:'Configuration playbook', deliverable_id:'dl3', parent_id:'ph2', owner_id:'u1', status:'todo', progress:0, sort_order:1, start_date:'2026-10-05', end_date:'2026-10-16' },
    { id:'t5', project_id:'pr1', type:'task', name:'Data model configuration', deliverable_id:'dl3', parent_id:'ph2', owner_id:'u1', status:'todo', progress:0, sort_order:1, start_date:'2026-10-05', end_date:'2026-10-08', duration_days:4, effort_min:240 },
    { id:'t6', project_id:'pr1', type:'task', name:'User role mapping', deliverable_id:'dl3', parent_id:'ph2', owner_id:'u3', status:'todo', progress:0, sort_order:2, start_date:'2026-10-06', end_date:'2026-10-07', duration_days:2, effort_min:120 },
    { id:'m2', project_id:'pr1', type:'milestone', name:'Configuration review pass', parent_id:'ph2', owner_id:'u1', status:'todo', progress:0, sort_order:3, end_date:'2026-10-30', duration_days:0 },
    // client follow-ups (surface in Focus, not in Plan)
    { id:'f1', project_id:'pr1', type:'followup', name:'Provide legal entity list', owner_id:'c1', status:'todo', progress:0, end_date:'2026-09-17', effort_min:0, flagged:true, parent_id:null },
    { id:'f2', project_id:'pr1', type:'followup', name:'Confirm phase 1 business units', owner_id:'c2', status:'todo', progress:0, end_date:null, effort_min:0, flagged:true, parent_id:null },
  ],
  dependencies: [
    { id:'d1', project_id:'pr1', predecessor_id:'t1', successor_id:'t2', type:'FS', lag_days:0 },
    { id:'d2', project_id:'pr1', predecessor_id:'dl1t', successor_id:'dl2t', type:'FS', lag_days:0 },
    { id:'d3', project_id:'pr1', predecessor_id:'t2', successor_id:'t3', type:'FS', lag_days:0 },
    { id:'d4', project_id:'pr1', predecessor_id:'t3', successor_id:'t4', type:'FS', lag_days:2 },
    { id:'d5', project_id:'pr1', predecessor_id:'dl2t', successor_id:'m1', type:'FS', lag_days:0 },
    { id:'d6', project_id:'pr1', predecessor_id:'ph1', successor_id:'ph2', type:'FS', lag_days:0 },
    { id:'d7', project_id:'pr1', predecessor_id:'m1', successor_id:'dl3t', type:'FS', lag_days:0 },
    { id:'d8', project_id:'pr1', predecessor_id:'t5', successor_id:'t6', type:'SS', lag_days:1 },
  ],
  meetings: [
    { id:'mt1', project_id:'pr1', title:'Francis Group — weekly delivery', date:'2026-09-14', start_time:'15:00', duration_min:55, notes:'Carry forward unresolved items from 11 Sep.' },
  ],
  meeting_items: [],
  meeting_item_links: [],
};
