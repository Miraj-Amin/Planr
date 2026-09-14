// forms.js — all create/edit forms.
// newProjectForm uses direct awaited Supabase calls to guarantee
// sequential insert order (project must exist before project_members).

import { openModal } from './modal.js';

const EFFORT_OPTS = [
  {value:'',label:'Not estimated'},
  {value:15,label:'15m'},{value:30,label:'30m'},
  {value:60,label:'1h'},{value:120,label:'2h'},
  {value:240,label:'4h'},{value:480,label:'1d'},
];

// ── PROJECT ──────────────────────────────────────────────────────────────────
// supabase: the raw Supabase client (from db.js) — needed for sequential awaits
export function newProjectForm(db, supabase, userId, onDone) {
  openModal({
    title: 'New project',
    fields: [
      { key:'name',       label:'Project name',        type:'text', required:true,  placeholder:'e.g. Acme Corp — CLM Rollout' },
      { key:'client_org', label:'Client organisation', type:'text', placeholder:'e.g. Acme Corp' },
    ],
    submitLabel: 'Create project',
    onSubmit: async data => {
      // Single atomic call — creates project AND adds owner via SECURITY DEFINER
      // function, bypassing the RLS chicken-and-egg problem.
      const { data: proj, error } = await supabase.rpc('create_project_for_user', {
        p_name:       data.name,
        p_client_org: data.client_org || null,
      });

      if (error) throw new Error(error.message);

      // Add to local cache
      (db._cache = db._cache || {});
      (db._cache.projects = db._cache.projects || []).push(proj);

      // Seed Sprint 1 — no FK constraint, safe as fire-and-forget
      supabase.from('sprints').insert({
        project_id: proj.id, is_active: true,
        name: 'Sprint 1 · ' + new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}),
        start_date: new Date().toISOString().slice(0,10),
        end_date:   new Date(Date.now()+12096e5).toISOString().slice(0,10),
      }).then(({ error: se }) => { if (se) console.warn('Sprint seed failed:', se.message); });

      onDone(proj);
    },
  });
}

// ── TASK ─────────────────────────────────────────────────────────────────────
export function newTaskForm(db, projectId, opts={}, onDone) {
  const people       = db.all('people');
  const phases       = db.all('tasks').filter(t => t.project_id===projectId && t.type==='phase');
  const deliverables = db.all('deliverables').filter(d => d.project_id===projectId);
  const sprints      = db.all('sprints').filter(s => s.project_id===projectId);
  const activeSprint = sprints.find(s=>s.is_active) || sprints[0];

  openModal({
    title: opts.title || 'New task',
    wide: true,
    fields: [
      { key:'name',          label:'Task name',       type:'text',   required:true,  placeholder:'What needs to be done?' },
      { key:'type',          label:'Type',            type:'select', value:opts.type||'task',
        options:[{value:'task',label:'Task'},{value:'deliverable',label:'Deliverable'},{value:'milestone',label:'Milestone'},{value:'agenda',label:'Agenda item'},{value:'followup',label:'Follow-up'}] },
      { key:'parent_id',     label:'Phase / parent',  type:'select', value:opts.parent_id||'',
        placeholder:'No parent', options:phases.map(p=>({value:p.id,label:p.name})) },
      { key:'deliverable_id',label:'Deliverable',     type:'select', value:opts.deliverable_id||'',
        placeholder:'Not linked', options:deliverables.map(d=>({value:d.id,label:d.name})) },
      { key:'owner_id',      label:'Owner',           type:'select', value:opts.owner_id||'',
        placeholder:'Unassigned', options:people.map(p=>({value:p.id,label:p.name+(p.is_client?' (client)':'')})) },
      { key:'effort_min',    label:'Effort estimate', type:'select', value:opts.effort_min||'', options:EFFORT_OPTS },
      { key:'priority',      label:'Priority',        type:'select', value:opts.priority||'normal',
        options:[{value:'urgent',label:'Urgent'},{value:'high',label:'High'},{value:'normal',label:'Normal'},{value:'low',label:'Low'}] },
      { key:'start_date',    label:'Start date',      type:'date',   value:opts.start_date||'' },
      { key:'end_date',      label:'Due date',        type:'date',   value:opts.end_date||'' },
      { key:'sprint_id',     label:'Sprint',          type:'select', value:opts.sprint_id||(activeSprint?.id||''),
        placeholder:'Backlog', options:sprints.map(s=>({value:s.id,label:s.name+(s.is_active?' (active)':'')})) },
      { key:'notes',         label:'Notes',           type:'textarea', placeholder:'Optional context…' },
    ],
    submitLabel: 'Create task',
    onSubmit: data => {
      const task = db.insert('tasks', {
        project_id:     projectId,
        parent_id:      data.parent_id      || null,
        deliverable_id: data.deliverable_id || null,
        sprint_id:      data.sprint_id      || null,
        type:           data.type,
        name:           data.name,
        notes:          data.notes          || null,
        status:         'todo',
        owner_id:       data.owner_id       || null,
        start_date:     data.start_date     || null,
        end_date:       data.end_date       || null,
        effort_min:     +data.effort_min    || 0,
        priority:       data.priority,
        flagged:        false, progress: 0, sort_order: (Date.now() % 2000000000),
      });
      onDone(task);
    },
  });
}

// ── PHASE ─────────────────────────────────────────────────────────────────────
export function newPhaseForm(db, projectId, onDone) {
  openModal({
    title: 'New phase',
    fields: [
      { key:'name',       label:'Phase name', type:'text', required:true, placeholder:'e.g. Discovery & Design' },
      { key:'start_date', label:'Start date', type:'date' },
      { key:'end_date',   label:'Target end', type:'date' },
    ],
    submitLabel: 'Create phase',
    onSubmit: data => {
      const phase = db.insert('tasks', {
        project_id:projectId, type:'phase', name:data.name,
        start_date:data.start_date||null, end_date:data.end_date||null,
        status:'todo', progress:0, sort_order: (Date.now() % 2000000000),
      });
      onDone(phase);
    },
  });
}

// ── DELIVERABLE ───────────────────────────────────────────────────────────────
export function newDeliverableForm(db, projectId, onDone) {
  openModal({
    title: 'New deliverable',
    fields: [
      { key:'name',        label:'Deliverable name', type:'text', required:true, placeholder:'e.g. Requirements pack' },
      { key:'due_date',    label:'Due date',          type:'date' },
      { key:'description', label:'Description',       type:'textarea', placeholder:'What this delivers…' },
    ],
    submitLabel: 'Create deliverable',
    onSubmit: data => {
      const dl = db.insert('deliverables', {
        project_id:projectId, name:data.name,
        due_date:data.due_date||null, description:data.description||null,
        status:'todo', sort_order: (Date.now() % 2000000000),
      });
      onDone(dl);
    },
  });
}

// ── MEETING ───────────────────────────────────────────────────────────────────
export function newMeetingForm(db, projectId, onDone) {
  const people = db.all('people');
  openModal({
    title: 'New meeting',
    wide: true,
    fields: [
      { key:'title',        label:'Meeting title',   type:'text',   required:true, placeholder:'e.g. Weekly delivery call' },
      { key:'date',         label:'Date',            type:'date',   required:true, value:new Date().toISOString().slice(0,10) },
      { key:'start_time',   label:'Start time',      type:'time',   value:'09:00' },
      { key:'duration_min', label:'Duration (mins)', type:'number', value:55, min:5, step:5 },
      { key:'attendee_ids', label:'Attendees',       type:'multi',
        options:people.map(p=>({value:p.id,label:p.name+(p.is_client?' · client':'')})) },
      { key:'notes',        label:'Notes',           type:'textarea', placeholder:'Optional agenda notes…' },
    ],
    submitLabel: 'Create meeting',
    onSubmit: data => {
      const meeting = db.insert('meetings', {
        project_id:projectId, title:data.title, date:data.date,
        start_time:data.start_time||'09:00', duration_min:data.duration_min||55,
        notes:data.notes||null, attendee_ids:data.attendee_ids||[],
      });
      onDone(meeting);
    },
  });
}

// ── MEETING ITEM ──────────────────────────────────────────────────────────────
export function newMeetingItemForm(db, supabase, projectId, meetingId, kind, onDone) {
  const people = db.all('people');
  const isFollowup = kind === 'followup';

  // Build channel options from existing meeting_items + defaults
  const tasksInProject = new Set(db.all('tasks').filter(t => t.project_id === projectId).map(t => t.id));
  const existingChannels = [...new Set(
    db.all('meeting_items')
      .filter(mi => tasksInProject.has(mi.task_id))
      .map(mi => mi.channel)
      .filter(Boolean)
  )];
  const channelOptions = [...new Set(['Email', 'Meeting', ...existingChannels])]
    .map(c => ({ value: c, label: c }));

  openModal({
    title: isFollowup ? 'Capture follow-up' : 'Add agenda item',
    fields: [
      { key:'name',     label:isFollowup?'Action / follow-up':'Agenda topic',
        type:'text', required:true, placeholder:isFollowup?'What was agreed?':'What needs to be discussed?' },
      { key:'owner_id', label:'Owner', type:'select', required:isFollowup,
        placeholder:isFollowup?'Who owns this?':'Optional owner',
        options:people.map(p=>({value:p.id,label:p.name+(p.is_client?' (client)':'')})) },
      ...(isFollowup
        ? [
            { key:'end_date', label:'Due date', type:'date', required:true },
            { key:'channel',  label:'Channel',  type:'select', placeholder:'How will this happen?',
              options: channelOptions,
              hint:'To add a new channel not in this list, save this follow-up first, then use the "+ New channel…" option on the item.' },
          ]
        : [{ key:'end_date', label:'Target date', type:'date' }]),
      { key:'notes', label:'Notes', type:'textarea', placeholder:'Optional…' },
    ],
    submitLabel: isFollowup ? 'Capture follow-up' : 'Add to agenda',
    onSubmit: async data => {
      // Sequential inserts — each FK-dependent record must exist server-side
      // before the next one references it. Fire-and-forget causes the link
      // to hit Supabase before the item is saved.

      // 1. Insert task, wait for confirmation
      const taskRec = {
        project_id: projectId, type: kind, name: data.name, notes: data.notes || null,
        status: 'todo', owner_id: data.owner_id || null,
        end_date: data.end_date || null,
        start_date: new Date().toISOString().slice(0, 10),
        effort_min: 0, priority: 'normal', progress: 0, flagged: true,
        sort_order: (Date.now() % 2000000000),
      };
      const { data: task, error: tErr } = await supabase.from('tasks').insert(taskRec).select().single();
      if (tErr) throw new Error(tErr.message);
      (db._cache = db._cache || {});
      (db._cache.tasks = db._cache.tasks || []).push(task);

      // 2. Insert meeting_item, wait for confirmation (channel only on follow-ups)
      const miRec = { task_id: task.id, kind, resolved: false, carried_from: null };
      if (isFollowup && data.channel) miRec.channel = data.channel;
      const { data: mi, error: miErr } = await supabase
        .from('meeting_items')
        .insert(miRec)
        .select().single();
      if (miErr) throw new Error(miErr.message);
      (db._cache.meeting_items = db._cache.meeting_items || []).push(mi);

      // 3. Insert link — safe now that both parents exist server-side
      const { data: link, error: lErr } = await supabase
        .from('meeting_item_links')
        .insert({ meeting_item_id: mi.id, meeting_id: meetingId })
        .select().single();
      if (lErr) throw new Error(lErr.message);
      (db._cache.meeting_item_links = db._cache.meeting_item_links || []).push(link);

      onDone(task);
    },
  });
}

// ── QUICK TASK ────────────────────────────────────────────────────────────────
export function quickTaskForm(db, projectId, defaults={}, onDone) {
  const people  = db.all('people');
  const sprints = db.all('sprints').filter(s => s.project_id===projectId);
  const activeSprint = sprints.find(s=>s.is_active) || sprints[0];
  openModal({
    title: 'Quick add task',
    fields: [
      { key:'name',     label:'Task name', type:'text', required:true, placeholder:'What needs to be done?' },
      { key:'owner_id', label:'Owner',     type:'select', placeholder:'Unassigned',
        options:people.map(p=>({value:p.id,label:p.name+(p.is_client?' (client)':'')})) },
      { key:'end_date', label:'Due date',  type:'date' },
      { key:'sprint_id',label:'Sprint',    type:'select', value:defaults.sprint_id||(activeSprint?.id||''),
        placeholder:'Backlog', options:sprints.map(s=>({value:s.id,label:s.name+(s.is_active?' (active)':'')})) },
    ],
    submitLabel: 'Add task',
    onSubmit: data => {
      const task = db.insert('tasks', {
        project_id:projectId, type:'task', name:data.name,
        status:defaults.status||'todo', owner_id:data.owner_id||null,
        end_date:data.end_date||null, sprint_id:data.sprint_id||null,
        effort_min:0, priority:'normal', progress:0, flagged:false, sort_order: (Date.now() % 2000000000),
        ...defaults,
      });
      onDone(task);
    },
  });
}
