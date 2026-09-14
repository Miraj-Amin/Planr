import { db, supabase }     from './services/db.js';
import { TaskService }       from './services/taskService.js';
import { renderProjects }    from './views/projectsView.js';
import { renderGrid }        from './views/gridView.js';
import { renderBoard }       from './views/boardView.js';
import { renderFocus }       from './views/focusView.js';
import { renderMeetings }    from './views/meetingsView.js';
import { renderContacts }    from './views/contactsView.js';
import { renderTemplates }   from './views/templatesView.js';
import { renderTemplateEdit } from './views/templateEditView.js';
import { renderRisks }       from './views/risksView.js';
import { renderGantt }       from './views/ganttView.js';
import { renderDashboard }   from './views/dashboardView.js';
import { showAuth }          from './views/authView.js';
import { addWorkdays, isoDate } from './lib/workdays.js';
import { newProjectForm, newTaskForm, newPhaseForm, newDeliverableForm,
         newMeetingForm, newMeetingItemForm, quickTaskForm } from './views/forms.js';

const taskSvc      = new TaskService(db);
let   currentUserId = null;

const VIEWS = [
  { id:'plan',      icon:'ti-subtask',       label:'Plan' },
  { id:'gantt',     icon:'ti-chart-gantt',   label:'Gantt' },
  { id:'board',     icon:'ti-layout-kanban', label:'Board' },
  { id:'focus',     icon:'ti-sun',           label:'Focus' },
  { id:'meetings',  icon:'ti-notebook',      label:'Meetings' },
  { id:'risks',     icon:'ti-flag',          label:'RAID' },
  { id:'dashboard', icon:'ti-layout-dashboard', label:'Dashboard' },
  { id:'contacts',  icon:'ti-users',         label:'Contacts' },
];

// Home-level (all projects) views — shown when no project is selected
const HOME_VIEWS = [
  { id:'projects',  icon:'ti-layout-grid',      label:'Projects' },
  { id:'dashboard', icon:'ti-layout-dashboard', label:'Portfolio' },
  { id:'focus',     icon:'ti-sun',              label:'Focus' },
  { id:'board',     icon:'ti-layout-kanban',    label:'Board' },
  { id:'templates', icon:'ti-template',         label:'Templates' },
];

let A = {
  view:'plan', project:null, sel:null, meeting:null,
  horizon:7, lane:'none', hideAgenda:false,
  homeView:'projects',
  templateId:null,   // when set + homeView==='templates', shows the editor
};

// ── loading ────────────────────────────────────────────────────────────────
function showLoading(msg) {
  const v = document.getElementById('view');
  if (v) v.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;
    gap:12px;color:#9CA3AF;font-size:13px">
    <i class="ti ti-loader-2" style="font-size:18px;animation:spin .8s linear infinite"></i>${msg||'Loading…'}</div>`;
  if (!document.getElementById('spinStyle')) {
    const s = document.createElement('style'); s.id='spinStyle';
    s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }
}

// ── go home (projects overview) ────────────────────────────────────────────
async function goHome() {
  A.project = null; A.sel = null; A.meeting = null; A.templateId = null;
  showLoading('Loading projects…');
  await db.loadOverview();
  renderApp();
}

// ── open a project ─────────────────────────────────────────────────────────
async function openProject(projId) {
  A.project = projId; A.view = 'plan'; A.sel = null;
  showLoading('Loading project…');
  await db.load(projId);
  renderApp();
}

// ── create a project from a template ───────────────────────────────────────
// Takes { name, client_org, startDate, tasks (from template_tasks), roleMap,
// sourceTemplate } and builds a project with a phase parent + child tasks,
// computing start/end dates from workday offsets.
async function createProjectFromTemplate({ name, client_org, startDate, tasks, roleMap, sourceTemplate }) {
  showLoading('Creating project…');

  // 1. Create the project via the RPC used elsewhere so RLS/membership rows land right
  let proj;
  try {
    const { data, error } = await supabase.rpc('create_project_for_user', { p_name: name });
    if (error) throw error;
    proj = data;
    // Some Supabase configs return an array; unwrap
    if (Array.isArray(proj)) proj = proj[0];
  } catch (e) {
    console.error(e);
    alert(`Couldn't create the project: ${e.message}`);
    await goHome();
    return;
  }

  // Patch the client on the fresh project
  if (client_org) {
    db.update('projects', proj.id, { client_org });
  }

  // 2. Group tasks by phase; each phase gets a parent row that children hang off.
  const byPhase = new Map();
  tasks.forEach(t => {
    const k = t.phase || '(uncategorised)';
    if (!byPhase.has(k)) byPhase.set(k, []);
    byPhase.get(k).push(t);
  });

  let sortOrder = 100;
  for (const [phaseName, phaseTasks] of byPhase.entries()) {
    // Phase parent — await so children can safely reference parent_id.
    const parent = await db.insertAwait('tasks', {
      project_id: proj.id,
      name: phaseName,
      type: 'phase',
      status: 'todo',
      sort_order: sortOrder,
      created_at: new Date().toISOString(),
    });
    sortOrder += 100;

    // Children can go in parallel now that the parent has committed.
    const childInserts = phaseTasks.map(tt => {
      const start = addWorkdays(startDate, tt.start_offset_workdays || 0);
      const end   = addWorkdays(start,     Math.max(0, (tt.duration_workdays || 1) - 1));
      const rec = {
        project_id:            proj.id,
        parent_id:             parent.id,
        name:                  tt.name,
        type:                  tt.is_milestone ? 'milestone' : 'task',
        status:                'todo',
        progress:              0,
        rag:                   'green',
        wbs:                   tt.wbs || null,
        workstream:            tt.workstream || null,
        phase:                 phaseName,
        is_milestone:          !!tt.is_milestone,
        owner_id:              tt.owner_role       ? (roleMap[tt.owner_role]       || null) : null,
        accountable_id:        tt.accountable_role ? (roleMap[tt.accountable_role] || null) : null,
        duration_workdays:     tt.duration_workdays || null,
        start_offset_workdays: tt.start_offset_workdays || null,
        start_date:            isoDate(start),
        end_date:              isoDate(end),
        key_dependency:        tt.key_dependency || null,
        acceptance_criteria:   tt.acceptance_criteria || null,
        sort_order:            (sortOrder += 10),
        created_at:            new Date().toISOString(),
      };
      return db.insertAwait('tasks', rec);
    });
    await Promise.all(childInserts);
  }

  await openProject(proj.id);
}

// ── shell ──────────────────────────────────────────────────────────────────
function renderShell(isHome) {
  // Rail — logo always goes home
  document.getElementById('rnav').innerHTML =
    (isHome ? '' : VIEWS.map(v =>
      `<div class="ri ${A.view===v.id?'on':''}" data-view="${v.id}" title="${v.label}">
         <i class="ti ${v.icon}"></i></div>`).join(''))
    + `<div style="flex:1"></div>
       <div class="ri" id="signOutBtn" title="Sign out"><i class="ti ti-logout"></i></div>`;

  // Top bar
  const topLeft = isHome
    ? `<div style="font-size:15px;font-weight:500;color:#1A1A22">Projects</div>`
    : `<div style="display:flex;align-items:center;gap:4px">
         <div class="crumb-back" id="backBtn">
           <i class="ti ti-chevron-left"></i><span>Projects</span>
         </div>
         <i class="ti ti-chevron-right" style="font-size:10px;color:#D1D5DB"></i>
         <span style="font-size:13px;font-weight:500;color:#1A1A22;max-width:280px;
           overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
           ${db.get('projects', A.project)?.name || 'Project'}</span>
       </div>`;

  document.getElementById('projLabel').innerHTML = topLeft;

  // Tabs — home shows HOME_VIEWS, in-project shows VIEWS
  document.getElementById('tabset').innerHTML = isHome
    ? HOME_VIEWS.map(v => `<div class="tab ${A.homeView===v.id?'on':''}" data-home-view="${v.id}">${v.label}</div>`).join('')
    : VIEWS.map(v => `<div class="tab ${A.view===v.id?'on':''}" data-view="${v.id}">${v.label}</div>`).join('');

  // Tools bar
  document.getElementById('tools').innerHTML = isHome ? '' : toolsHTML();

  // New task / new project button
  const btn = document.getElementById('mainBtn');
  if (btn) {
    btn.textContent = '';
    btn.style.display = '';  // reset from prior view
    const ico = document.createElement('i');
    ico.className = 'ti ti-plus';
    ico.style.cssText = 'font-size:11px';
    btn.appendChild(ico);
    btn.appendChild(document.createTextNode(isHome ? ' New project' : ' New task'));
  }

  document.getElementById('signOutBtn')?.addEventListener('click', async () => {
    await supabase.auth.signOut(); location.reload();
  });
  document.getElementById('backBtn')?.addEventListener('click', goHome);
  document.querySelector('.logo')?.addEventListener('click', goHome);
}

function toolsHTML() {
  if (A.view === 'plan') return `
    <button class="btn ghost" id="addPhaseBtn"><i class="ti ti-plus" style="font-size:10px"></i>Phase</button>
    <button class="btn ghost" id="addDlBtn"><i class="ti ti-plus" style="font-size:10px"></i>Deliverable</button>`;
  if (A.view === 'board') return `
    <select id="laneSel" style="height:26px;border:.5px solid rgba(0,0,0,.13);border-radius:6px;font-size:11px;color:#6B7280;background:#fff;padding:0 7px;cursor:pointer;outline:none">
      <option value="none"        ${A.lane==='none'?'selected':''}>No swimlanes</option>
      <option value="deliverable" ${A.lane==='deliverable'?'selected':''}>By deliverable</option>
      <option value="owner"       ${A.lane==='owner'?'selected':''}>By owner</option>
      <option value="type"        ${A.lane==='type'?'selected':''}>By type</option>
    </select>
    <button class="btn ghost ${A.hideAgenda?'on':''}" id="agendaTgl">
      <i class="ti ti-message-circle" style="font-size:10px"></i>${A.hideAgenda?'Agenda hidden':'Show agenda'}</button>`;
  if (A.view === 'focus') return '';
  if (A.view === 'meetings') return `
    <button class="btn ghost" id="addMtgBtn"><i class="ti ti-plus" style="font-size:10px"></i>New meeting</button>`;
  return '';
}

// ── helpers ────────────────────────────────────────────────────────────────
const projTasks  = () => db.all('tasks').filter(t => t.project_id === A.project);

// Best-effort: find the people record matching the logged-in auth user (by email).
// Comments write person IDs, but auth uses a separate user id. If unmatched, returns null;
// comments will still save with no author.
function currentUserPersonId() {
  const email = (window.__currentUserEmail || '').toLowerCase();
  if (!email) return null;
  const p = db.all('people').find(x => (x.email || '').toLowerCase() === email);
  return p?.id || null;
}
const projDeps   = () => db.all('dependencies').filter(d => d.project_id === A.project);
const projStart  = () => { const d=projTasks().map(t=>t.start_date).filter(Boolean).sort(); return d[0]||new Date().toISOString().slice(0,10); };
const people     = () => db.all('people');

// ── main render ────────────────────────────────────────────────────────────
function renderApp() {
  const isHome = !A.project;
  renderShell(isHome);

  const mount = document.getElementById('view');

  if (isHome) {
    if (A.homeView === 'focus') {
      mount.innerHTML = `<div id="focusMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>`;
      renderFocus({
        mount: document.getElementById('focusMount'),
        tasks: db.all('allTasks'),
        people: db.all('people'),
        projects: db.all('projects'),
        db,
        global: true,
        onSelect: () => {},   // no side-panel at home level for now
        onRerender: () => renderApp(),
      });
      const mb = document.getElementById('mainBtn');
      if (mb) mb.style.display = 'none';
      return;
    }

    if (A.homeView === 'board') {
      mount.innerHTML = `<div id="boardMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>`;
      renderBoard({
        mount: document.getElementById('boardMount'),
        tasks: db.all('allTasks'),
        people: db.all('people'),
        deliverables: db.all('deliverables'),
        sprints: db.all('sprints'),
        projects: db.all('projects'),
        selId: null,
        lane: A.lane === 'none' ? 'project' : A.lane,  // group by project by default in global mode
        hideAgenda: A.hideAgenda,
        global: true,
        onSelect: () => {},
        onStatusChange: (taskId, newStatus) => {
          db.update('tasks', taskId, { status: newStatus });
          renderApp();
        },
      });
      const mb = document.getElementById('mainBtn');
      if (mb) mb.style.display = 'none';
      return;
    }

    if (A.homeView === 'dashboard') {
      renderDashboard({
        mount,
        projectId: null,
        tasks: db.all('allTasks'),
        projects: db.all('projects'),
        risks: db.all('risks'),
        deliverables: db.all('deliverables'),
        people: db.all('people'),
      });
      const mb = document.getElementById('mainBtn');
      if (mb) mb.style.display = 'none';
      return;
    }

    if (A.homeView === 'templates') {
      if (A.templateId) {
        renderTemplateEdit({
          mount,
          templateId: A.templateId,
          templates: db.all('templates'),
          template_tasks: db.all('template_tasks'),
          db,
          onBack: () => { A.templateId = null; renderApp(); },
          onRerender: () => renderApp(),
        });
      } else {
        renderTemplates({
          mount,
          templates: db.all('templates'),
          template_tasks: db.all('template_tasks'),
          projects: db.all('projects'),
          people: db.all('people'),
          db,
          onCreateProject: opts => createProjectFromTemplate(opts),
        });
      }
      const mb = document.getElementById('mainBtn');
      if (mb) mb.style.display = 'none';
      return;
    }

    // Default: projects grid
    renderProjects({
      mount,
      projects:     db.all('projects'),
      allTasks:     db.all('allTasks'),
      people:       db.all('people'),
      deliverables: db.all('deliverables'),
      onSelect: projId => openProject(projId),
      onCreate: () => newProjectForm(db, supabase, currentUserId, proj => {
        db._cache.projects = db._cache.projects || [];
        if (!db._cache.projects.find(p=>p.id===proj.id)) db._cache.projects.push(proj);
        openProject(proj.id);
      }),
    });
    document.getElementById('mainBtn')?.addEventListener('click', () =>
      newProjectForm(db, supabase, currentUserId, proj => openProject(proj.id)));
    return;
  }

  // ── PLAN ──────────────────────────────────────────────────────────────────
  if (A.view === 'plan') {
    mount.innerHTML = `<div id="gridMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>`;
    function rerender(afterFn) {
      const t2=projTasks(), d2=db.all('deliverables').filter(d=>d.project_id===A.project),
            s2=db.all('sprints').filter(s=>s.project_id===A.project);
      renderGrid({ mount:document.getElementById('gridMount'), tasks:t2, people:people(),
        deliverables:d2, sprints:s2, db, projectId:A.project,
        onSelect: id => { A.sel = A.sel===id?null:id; renderPanel(); },
        onRerender: fn => rerender(fn) });
      if (afterFn) requestAnimationFrame(afterFn);
    }
    rerender();
    document.getElementById('mainBtn')?.addEventListener('click', () =>
      newTaskForm(db, A.project, {}, () => rerender()));
    document.getElementById('addPhaseBtn')?.addEventListener('click', () =>
      newPhaseForm(db, A.project, () => rerender()));
    document.getElementById('addDlBtn')?.addEventListener('click', () =>
      newDeliverableForm(db, A.project, () => rerender()));
    return;
  }

  // ── BOARD ─────────────────────────────────────────────────────────────────
  if (A.view === 'board') {
    mount.innerHTML = `<div id="boardMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>`;
    renderBoard({
      mount: document.getElementById('boardMount'),
      tasks: projTasks(), people: people(),
      deliverables: db.all('deliverables').filter(d=>d.project_id===A.project),
      sprints:      db.all('sprints').filter(s=>s.project_id===A.project),
      selId: A.sel, lane: A.lane, hideAgenda: A.hideAgenda,
      onSelect: id => { A.sel = A.sel===id?null:id; renderApp(); },
      onStatusChange: (id, status) => { db.update('tasks', id, {status, progress:status==='done'?100:undefined}); renderApp(); },
      onAddTask: status => quickTaskForm(db, A.project, {status}, () => renderApp()),
    });
    document.getElementById('mainBtn')?.addEventListener('click', () =>
      quickTaskForm(db, A.project, {}, () => renderApp()));
    document.getElementById('agendaTgl')?.addEventListener('click', () => { A.hideAgenda=!A.hideAgenda; renderApp(); });
    return;
  }

  // ── FOCUS ─────────────────────────────────────────────────────────────────
  if (A.view === 'focus') {
    mount.innerHTML = `<div id="focusMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>`;
    renderFocus({
      mount: document.getElementById('focusMount'),
      tasks: projTasks(),
      people: people(),
      projects: db.all('projects'),
      db,
      onSelect: id => { A.sel = A.sel === id ? null : id; renderApp(); },
      onRerender: () => renderApp(),
    });
    document.getElementById('mainBtn')?.addEventListener('click', () =>
      newTaskForm(db, A.project, {}, () => renderApp()));
    return;
  }

  // ── MEETINGS ──────────────────────────────────────────────────────────────
  if (A.view === 'meetings') {
    const projMeetings = db.all('meetings').filter(m=>m.project_id===A.project);
    if (!A.meeting && projMeetings.length) A.meeting = projMeetings[0].id;
    mount.innerHTML = `<div id="mtgMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>`;
    renderMeetings({
      mount: document.getElementById('mtgMount'),
      meetings: projMeetings, meeting_items: db.all('meeting_items'),
      meeting_item_links: db.all('meeting_item_links'),
      tasks: projTasks(), people: people(), activeMeeting: A.meeting,
      db, projectId: A.project,
      onSelectMeeting: id => { A.meeting=id; renderApp(); },
      onSelectTask:    id => { A.sel=A.sel===id?null:id; renderApp(); },
      onAddAgenda:     () => newMeetingItemForm(db,supabase,A.project,A.meeting,'agenda',()=>renderApp()),
      onAddFollowup:   () => newMeetingItemForm(db,supabase,A.project,A.meeting,'action',()=>renderApp()),
      onRerender:      () => renderApp(),
    });
    const createMeeting = () => newMeetingForm(db, A.project, m => {
      // Carry forward all unresolved items from prior meetings.
      // They land on the NEW meeting's AGENDA (on_agenda=true) so they get
      // discussed — that's the whole point of a carry-forward.
      const items = db.all('meeting_items');
      const links = db.all('meeting_item_links');
      const projectTasks = db.all('tasks').filter(t => t.project_id === A.project);
      const taskById = new Map(projectTasks.map(t => [t.id, t]));
      items.forEach(item => {
        const task = taskById.get(item.task_id);
        if (!task) return;
        if (item.resolved) return;
        if (task.status === 'done') return;
        const already = links.some(l => l.meeting_item_id === item.id && l.meeting_id === m.id);
        if (!already) {
          db.insert('meeting_item_links', { meeting_item_id: item.id, meeting_id: m.id, on_agenda: true });
        }
      });
      A.meeting = m.id;
      renderApp();
    });
    document.getElementById('addMtgBtn')?.addEventListener('click', createMeeting);
    document.getElementById('mainBtn')?.addEventListener('click', createMeeting);
    return;
  }

  // ── GANTT ─────────────────────────────────────────────────────────────────
  if (A.view === 'gantt') {
    mount.innerHTML = `<div id="ganttMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>`;
    renderGantt({
      mount: document.getElementById('ganttMount'),
      tasks: projTasks(),
      people: people(),
      projectId: A.project,
      onSelect: id => { A.sel = A.sel === id ? null : id; renderPanel(); },
    });
    const mb = document.getElementById('mainBtn');
    if (mb) mb.style.display = 'none';
    return;
  }

  // ── RAID LOG ──────────────────────────────────────────────────────────────
  if (A.view === 'risks') {
    mount.innerHTML = `<div id="risksMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>`;
    renderRisks({
      mount: document.getElementById('risksMount'),
      risks: db.all('risks'),
      people: people(),
      projectId: A.project,
      project: db.get('projects', A.project),
      db,
      onRerender: () => renderApp(),
    });
    const mb = document.getElementById('mainBtn');
    if (mb) mb.style.display = 'none';
    return;
  }

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  if (A.view === 'dashboard') {
    renderDashboard({
      mount,
      projectId: A.project,
      tasks: db.all('tasks'),
      projects: db.all('projects'),
      risks: db.all('risks'),
      deliverables: db.all('deliverables'),
      people: people(),
    });
    const mb = document.getElementById('mainBtn');
    if (mb) mb.style.display = 'none';
    return;
  }

  // ── CONTACTS ──────────────────────────────────────────────────────────────
  if (A.view === 'contacts') {
    mount.innerHTML = `<div id="contactsMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>`;
    renderContacts({
      mount:            document.getElementById('contactsMount'),
      people:           db.all('people'),
      project_contacts: db.all('project_contacts'),
      projects:         db.all('projects'),
      projectId:        A.project,
      project:          db.get('projects', A.project),
      db,
      onRerender:       () => renderApp(),
    });
    // Hide the top-right button since Add is inside the view
    const mb = document.getElementById('mainBtn');
    if (mb) mb.style.display = 'none';
    return;
  }
}

// ── panel ──────────────────────────────────────────────────────────────────
function renderPanel() {
  const panel = document.getElementById('panel');
  const t = A.sel ? db.get('tasks', A.sel) : null;
  if (!t) { panel.classList.remove('open'); return; }
  panel.classList.add('open');

  const ppl  = people();
  const preds = taskSvc.predecessorsOf(t.id);
  const succs  = taskSvc.successorsOf(t.id);
  const av = pid => { const pp=ppl.find(x=>x.id===pid); return pp?`<span class="av" style="width:20px;height:20px;font-size:8px;background:${pp.color}">${pp.initials}</span>`:''; };
  const candidates = db.all('tasks').filter(x=>x.project_id===A.project&&x.id!==t.id&&x.type!=='followup'&&x.type!=='agenda');
  const ps = projStart();
  const EFFORT = [{v:15,l:'15m'},{v:30,l:'30m'},{v:60,l:'1h'},{v:120,l:'2h'},{v:240,l:'4h'},{v:480,l:'1d'}];
  const deliverables = db.all('deliverables').filter(d=>d.project_id===A.project);
  const sprints      = db.all('sprints').filter(s=>s.project_id===A.project);

  document.getElementById('panelIn').innerHTML = `
  <div class="ph2">
    <span class="ph-x" id="pX"><i class="ti ti-x" style="font-size:14px"></i></span>
    <div style="font-size:14px;font-weight:500;line-height:1.35;padding-right:26px;margin-bottom:12px">${t.name||'Untitled'}</div>
    <div class="pf"><span class="pf-l">Type</span><span class="pf-v">
      <select id="fType">${['task','deliverable','milestone','agenda','followup','phase'].map(v=>
        `<option value="${v}" ${v===t.type?'selected':''}>${v}</option>`).join('')}</select></span></div>
    <div class="pf"><span class="pf-l">Status</span><span class="pf-v">
      <select id="fStatus">${['todo','in-progress','blocked','review','done'].map(s=>
        `<option value="${s}" ${s===t.status?'selected':''}>${s}</option>`).join('')}</select></span></div>
    <div class="pf"><span class="pf-l">Owner</span><span class="pf-v">${av(t.owner_id)}
      <select id="fOwner"><option value="">Unassigned</option>
        ${ppl.map(p=>`<option value="${p.id}" ${p.id===t.owner_id?'selected':''}>${p.name}${p.is_client?' (client)':''}</option>`).join('')}
      </select></span></div>
    <div class="pf"><span class="pf-l">Deliverable</span><span class="pf-v">
      <select id="fDeliv"><option value="">Not linked</option>
        ${deliverables.map(d=>`<option value="${d.id}" ${d.id===t.deliverable_id?'selected':''}>${d.name}</option>`).join('')}
      </select></span></div>
    <div class="pf"><span class="pf-l">Sprint</span><span class="pf-v">
      <select id="fSprint"><option value="">Backlog</option>
        ${sprints.map(s=>`<option value="${s.id}" ${s.id===t.sprint_id?'selected':''}>${s.name}</option>`).join('')}
      </select></span></div>
    <div class="pf"><span class="pf-l">Effort</span><span class="pf-v">
      <select id="fEff"><option value="0">Not estimated</option>
        ${EFFORT.map(e=>`<option value="${e.v}" ${e.v===t.effort_min?'selected':''}>${e.l}</option>`).join('')}
      </select></span></div>
    <div class="pf"><span class="pf-l">Priority</span><span class="pf-v">
      <select id="fPri">${['urgent','high','normal','low'].map(v=>
        `<option value="${v}" ${v===t.priority?'selected':''}>${v}</option>`).join('')}</select></span></div>
    <div class="pf"><span class="pf-l">Start</span><span class="pf-v">
      <input id="fStart" type="date" value="${t.start_date||''}" style="border:.5px solid rgba(0,0,0,.18);border-radius:6px;padding:3px 6px;font-size:12px;outline:none"></span></div>
    <div class="pf"><span class="pf-l">Due</span><span class="pf-v">
      <input id="fEnd" type="date" value="${t.end_date||''}" style="border:.5px solid rgba(0,0,0,.18);border-radius:6px;padding:3px 6px;font-size:12px;outline:none"></span></div>
    <div class="pf"><span class="pf-l">Flag</span><span class="pf-v">
      <div id="fFlag" style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:8px;font-size:12px;
        background:${t.flagged?'rgba(186,117,23,.08)':'rgba(0,0,0,.03)'};color:${t.flagged?'#BA7517':'#9CA3AF'}">
        <i class="ti ti-message-circle" style="font-size:13px"></i>${t.flagged?'Flagged for agenda':'Flag for next meeting'}
      </div></span></div>
    ${t.notes?`<div class="psec-h">Notes</div><div style="font-size:12px;color:#6B7280;line-height:1.6;padding:0 0 12px">${t.notes}</div>`:''}
    <div class="psec-h">Predecessors</div>
    ${preds.length
      ? preds.map(x=>`<div class="dep-item"><span class="dep-kind">${x.dep.type}${x.dep.lag_days?(x.dep.lag_days>0?' +'+x.dep.lag_days:' '+x.dep.lag_days):''}</span>${x.task.name}
          <span class="dep-rm" data-rmdep="${x.dep.id}"><i class="ti ti-x"></i></span></div>`).join('')
      : `<div style="font-size:11px;color:#9CA3AF;padding:3px 0">No predecessors.</div>`}
    <div class="dep-add">
      <select id="depTask"><option value="">Add predecessor…</option>
        ${candidates.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select>
      <select id="depType">${['FS','SS','FF','SF'].map(d=>`<option>${d}</option>`).join('')}</select>
      <input id="depLag" type="number" value="0" style="width:40px;border:.5px solid rgba(0,0,0,.18);border-radius:5px;padding:3px;font-size:11px;text-align:center">
      <button id="depAdd">Link</button>
    </div>
    ${succs.length?`<div class="psec-h">Successors</div>${succs.map(x=>`<div class="dep-item"><span class="dep-kind">${x.dep.type}</span>${x.task.name}</div>`).join('')}`:''}

    <!-- Comments section -->
    ${(() => {
      const allComments = db.all('task_comments') || [];
      const comments = allComments
        .filter(c => c.task_id === t.id && !c.deleted_at)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      const historyByComment = new Map();
      (db.all('task_comment_history') || []).forEach(h => {
        if (!historyByComment.has(h.comment_id)) historyByComment.set(h.comment_id, []);
        historyByComment.get(h.comment_id).push(h);
      });

      const fmtTime = iso => {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleString(undefined, { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
      };

      return `
        <div class="psec-h" style="margin-top:20px">Comments <span style="font-weight:400;color:#9CA3AF">${comments.length}</span></div>
        <div class="cmt-list">
          ${comments.length === 0
            ? '<div style="font-size:11px;color:#9CA3AF;padding:4px 0 8px;font-style:italic">No comments yet.</div>'
            : comments.map(c => {
                const author = ppl.find(p => p.id === c.author_id);
                const hist = historyByComment.get(c.id) || [];
                const wasEdited = c.updated_at && c.created_at && c.updated_at !== c.created_at;
                return `<div class="cmt" data-comment="${c.id}">
                  <div class="cmt-h">
                    ${author ? `<div class="av" style="width:22px;height:22px;font-size:9px;background:${author.color}">${author.initials}</div>` : '<div class="av" style="width:22px;height:22px;font-size:9px;background:#C4C9D4">?</div>'}
                    <span class="cmt-a">${author?.name || 'Unknown'}</span>
                    <span class="cmt-t">${fmtTime(c.created_at)}</span>
                    ${wasEdited ? `<span class="cmt-edited" data-comment="${c.id}" title="Edited ${fmtTime(c.updated_at)} — click to view history"><i class="ti ti-pencil" style="font-size:9px"></i>edited</span>` : ''}
                    <span style="flex:1"></span>
                    <button class="cmt-edit-btn" data-comment="${c.id}" title="Edit">
                      <i class="ti ti-pencil" style="font-size:11px"></i>
                    </button>
                    <button class="cmt-del-btn" data-comment="${c.id}" title="Delete">
                      <i class="ti ti-trash" style="font-size:11px"></i>
                    </button>
                  </div>
                  <div class="cmt-body" data-comment="${c.id}">${(c.body || '').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>
                  ${hist.length ? `<div class="cmt-hist-wrap" data-comment="${c.id}" style="display:none">
                    <div class="cmt-hist-h">Edit history (${hist.length})</div>
                    ${hist.sort((a,b)=>(b.edited_at||'').localeCompare(a.edited_at||'')).map(h => `
                      <div class="cmt-hist-item">
                        <div class="cmt-hist-t">${fmtTime(h.edited_at)}</div>
                        <div class="cmt-hist-body">${(h.body || '').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>
                      </div>
                    `).join('')}
                  </div>` : ''}
                </div>`;
              }).join('')}
        </div>
        <div class="cmt-add">
          <textarea id="cmtNew" placeholder="Add a comment…" rows="2"
            style="width:100%;box-sizing:border-box;border:.5px solid rgba(0,0,0,.15);border-radius:6px;padding:8px 10px;font-size:12px;font-family:inherit;resize:vertical;min-height:52px;outline:none"></textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:6px">
            <button id="cmtSubmit" class="btn" style="height:28px;padding:0 12px;font-size:11px">Post comment</button>
          </div>
        </div>
      `;
    })()}

    <div style="padding-top:14px;border-top:1px solid rgba(0,0,0,.06);margin-top:14px">
      <button id="delTask" style="font-size:11px;color:#9CA3AF;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:5px">
        <i class="ti ti-trash" style="font-size:13px"></i>Delete task</button>
    </div>
  </div>`;

  const on = (id, ev, fn) => { const n=document.getElementById(id); if(n)n.addEventListener(ev,fn); };

  // ── Comment handlers ────────────────────────────────────────────────
  on('cmtSubmit', 'click', () => {
    const ta = document.getElementById('cmtNew');
    const body = (ta.value || '').trim();
    if (!body) return;
    db.insert('task_comments', {
      task_id: t.id,
      author_id: currentUserPersonId(),
      body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    });
    renderPanel();
  });
  document.querySelectorAll('.cmt-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.comment;
      const comment = (db.all('task_comments') || []).find(c => c.id === cid);
      if (!comment) return;
      const bodyEl = document.querySelector(`.cmt-body[data-comment="${cid}"]`);
      // Replace the body with an inline editor
      bodyEl.innerHTML = `
        <textarea class="cmt-edit-ta" style="width:100%;box-sizing:border-box;border:.5px solid rgba(0,0,0,.15);border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit;resize:vertical;min-height:52px;outline:none"></textarea>
        <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:4px">
          <button class="cmt-edit-cancel" style="background:transparent;border:0;color:#9CA3AF;font-size:11px;cursor:pointer;padding:3px 8px">Cancel</button>
          <button class="cmt-edit-save" style="background:#534AB7;border:0;color:#fff;font-size:11px;cursor:pointer;padding:3px 10px;border-radius:5px;font-weight:500">Save</button>
        </div>`;
      const ta = bodyEl.querySelector('.cmt-edit-ta');
      ta.value = comment.body || '';
      ta.focus();
      bodyEl.querySelector('.cmt-edit-cancel').addEventListener('click', () => renderPanel());
      bodyEl.querySelector('.cmt-edit-save').addEventListener('click', () => {
        const newBody = (ta.value || '').trim();
        if (!newBody || newBody === comment.body) { renderPanel(); return; }
        // Insert history record for the PRIOR body first (mirrors what the DB trigger does),
        // then update the comment.
        db.insert('task_comment_history', {
          comment_id: comment.id,
          body: comment.body,
          edited_at: new Date().toISOString(),
          edited_by: currentUserPersonId(),
        });
        db.update('task_comments', comment.id, {
          body: newBody,
          updated_at: new Date().toISOString(),
        });
        renderPanel();
      });
    });
  });
  document.querySelectorAll('.cmt-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.comment;
      if (!confirm('Delete this comment?')) return;
      db.update('task_comments', cid, { deleted_at: new Date().toISOString() });
      renderPanel();
    });
  });
  document.querySelectorAll('.cmt-edited').forEach(el => {
    el.addEventListener('click', () => {
      const cid = el.dataset.comment;
      const wrap = document.querySelector(`.cmt-hist-wrap[data-comment="${cid}"]`);
      if (!wrap) return;
      wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
    });
  });
  on('pX',      'click', () => { A.sel=null; renderPanel(); });
  on('fType',   'change', e => { db.update('tasks',t.id,{type:e.target.value}); renderPanel(); });
  on('fStatus', 'change', e => { db.update('tasks',t.id,{status:e.target.value,progress:e.target.value==='done'?100:t.progress}); renderPanel(); });
  on('fOwner',  'change', e => { db.update('tasks',t.id,{owner_id:e.target.value||null}); renderPanel(); });
  on('fDeliv',  'change', e => { db.update('tasks',t.id,{deliverable_id:e.target.value||null}); renderPanel(); });
  on('fSprint', 'change', e => { db.update('tasks',t.id,{sprint_id:e.target.value||null}); renderPanel(); });
  on('fEff',    'change', e => { db.update('tasks',t.id,{effort_min:+e.target.value}); renderPanel(); });
  on('fPri',    'change', e => { db.update('tasks',t.id,{priority:e.target.value}); renderPanel(); });
  on('fStart',  'change', e => { taskSvc.setDates(t.id,A.project,ps,e.target.value||null,t.end_date); renderPanel(); });
  on('fEnd',    'change', e => { taskSvc.setDates(t.id,A.project,ps,t.start_date,e.target.value||null); renderPanel(); });
  on('fFlag',   'click',  () => { db.update('tasks',t.id,{flagged:!t.flagged}); renderPanel(); });
  on('depAdd',  'click',  () => {
    const pid=document.getElementById('depTask')?.value;
    const ty =document.getElementById('depType')?.value;
    const lag=+(document.getElementById('depLag')?.value||0);
    if(!pid) return;
    try { taskSvc.addDependency(A.project,pid,t.id,ty,lag,ps); renderPanel(); }
    catch(err) { alert(err.message); }
  });
  on('delTask', 'click', () => {
    if (confirm(`Delete "${t.name}"?`)) { db.remove('tasks',t.id); A.sel=null; renderApp(); }
  });
  document.querySelectorAll('[data-rmdep]').forEach(n =>
    n.addEventListener('click', () => { taskSvc.removeDependency(n.dataset.rmdep,A.project,ps); renderPanel(); }));
}

// ── global events ──────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const v = e.target.closest('[data-view]');
  if (v) { A.view=v.dataset.view; A.sel=null; renderApp(); return; }
  const hv = e.target.closest('[data-home-view]');
  if (hv) { A.homeView=hv.dataset.homeView; A.sel=null; A.templateId=null; renderApp(); return; }
  const hz = e.target.closest('[data-hz]');
  if (hz) { A.horizon=+hz.dataset.hz; renderApp(); return; }
});
document.addEventListener('change', e => {
  if (e.target.id==='laneSel') { A.lane=e.target.value; renderApp(); }
});
document.addEventListener('keydown', e => { if(e.key==='Escape'){ A.sel=null; renderPanel(); } });

// Cross-view events fired by children:
// - planr:openProject   → jump into a project (from Portfolio dashboard)
// - planr:openTemplate  → open a template in the editor (from Templates list)
// - planr:rerender      → re-render current view (from Templates after import/delete)
window.addEventListener('planr:openProject',  e => { openProject(e.detail); });
window.addEventListener('planr:openTemplate', e => { A.homeView = 'templates'; A.templateId = e.detail; renderApp(); });
window.addEventListener('planr:rerender',    () => { renderApp(); });

// ── shell HTML ─────────────────────────────────────────────────────────────
const SHELL = `<div class="app">
  <div class="rail">
    <div class="logo" style="cursor:pointer" title="All projects">P</div>
    <div id="rnav" style="display:flex;flex-direction:column;gap:2px;align-items:center;width:100%"></div>
  </div>
  <div class="main">
    <div class="top">
      <div id="projLabel"></div>
      <div id="tools" style="display:flex;align-items:center;gap:8px"></div>
      <div style="flex:1"></div>
      <button class="btn" id="mainBtn" style="height:32px;padding:0 16px;font-size:12.5px"></button>
    </div>
    <div class="tabs"><div id="tabset" style="display:flex"></div></div>
    <div class="view" id="view"></div>
    <div class="panel" id="panel"><div id="panelIn"></div></div>
  </div>
</div>`;

// ── boot ───────────────────────────────────────────────────────────────────
async function boot() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    showAuth(supabase, async user => {
      currentUserId = user?.id || null;
      window.__currentUserEmail = user?.email || null;
      document.body.innerHTML = SHELL;
      showLoading('Loading projects…');
      await db.loadOverview();
      renderApp();
    });
    return;
  }

  currentUserId = session.user.id;
  window.__currentUserEmail = session.user.email;
  showLoading('Loading projects…');
  await db.loadOverview();
  renderApp();
}

boot();
