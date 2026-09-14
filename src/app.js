import { db, supabase }     from './services/db.js';
import { TaskService }       from './services/taskService.js';
import { renderProjects }    from './views/projectsView.js';
import { renderGrid }        from './views/gridView.js';
import { renderBoard }       from './views/boardView.js';
import { renderFocus }       from './views/focusView.js';
import { renderMeetings }    from './views/meetingsView.js';
import { renderContacts }    from './views/contactsView.js';
import { showAuth }          from './views/authView.js';
import { newProjectForm, newTaskForm, newPhaseForm, newDeliverableForm,
         newMeetingForm, newMeetingItemForm, quickTaskForm } from './views/forms.js';

const taskSvc      = new TaskService(db);
let   currentUserId = null;

const VIEWS = [
  { id:'plan',     icon:'ti-subtask',       label:'Plan' },
  { id:'board',    icon:'ti-layout-kanban', label:'Board' },
  { id:'focus',    icon:'ti-sun',           label:'Focus' },
  { id:'meetings', icon:'ti-notebook',      label:'Meetings' },
  { id:'contacts', icon:'ti-users',         label:'Contacts' },
];

let A = {
  view:'plan', project:null, sel:null, meeting:null,
  horizon:7, lane:'none', hideAgenda:false,
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
  A.project = null; A.sel = null; A.meeting = null;
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

  // Tabs (only when inside a project)
  document.getElementById('tabset').innerHTML = isHome ? '' : VIEWS.map(v =>
    `<div class="tab ${A.view===v.id?'on':''}" data-view="${v.id}">${v.label}</div>`).join('');

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
  if (A.view === 'focus') return [1,7,30].map(n =>
    `<button class="btn ghost ${A.horizon===n?'on':''}" data-hz="${n}">${n===1?'Today':n===7?'This week':'This month'}</button>`).join('');
  if (A.view === 'meetings') return `
    <button class="btn ghost" id="addMtgBtn"><i class="ti ti-plus" style="font-size:10px"></i>New meeting</button>`;
  return '';
}

// ── helpers ────────────────────────────────────────────────────────────────
const projTasks  = () => db.all('tasks').filter(t => t.project_id === A.project);
const projDeps   = () => db.all('dependencies').filter(d => d.project_id === A.project);
const projStart  = () => { const d=projTasks().map(t=>t.start_date).filter(Boolean).sort(); return d[0]||new Date().toISOString().slice(0,10); };
const people     = () => db.all('people');

// ── main render ────────────────────────────────────────────────────────────
function renderApp() {
  const isHome = !A.project;
  renderShell(isHome);

  const mount = document.getElementById('view');

  if (isHome) {
    renderProjects({
      mount,
      projects:     db.all('projects'),
      allTasks:     db.all('allTasks'),
      people:       db.all('people'),
      deliverables: db.all('deliverables'),
      onSelect: projId => openProject(projId),
      onCreate: () => newProjectForm(db, supabase, currentUserId, proj => {
        // update overview cache immediately
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
    renderFocus({ mount:document.getElementById('focusMount'), tasks:db.all('tasks'),
      people:people(), projects:db.all('projects'), horizon:A.horizon,
      onSelect:id=>{ A.sel=A.sel===id?null:id; renderApp(); } });
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
      onAddFollowup:   () => newMeetingItemForm(db,supabase,A.project,A.meeting,'followup',()=>renderApp()),
      onRerender:      () => renderApp(),
    });
    const createMeeting = () => newMeetingForm(db, A.project, m => {
      // Carry forward all unresolved items from prior meetings
      const items = db.all('meeting_items');
      const links = db.all('meeting_item_links');
      const projectTasks = db.all('tasks').filter(t => t.project_id === A.project);
      const taskById = new Map(projectTasks.map(t => [t.id, t]));
      items.forEach(item => {
        const task = taskById.get(item.task_id);
        if (!task) return;
        if (item.resolved) return;
        if (task.status === 'done') return;
        // Check not already linked to this new meeting
        const already = links.some(l => l.meeting_item_id === item.id && l.meeting_id === m.id);
        if (!already) {
          db.insert('meeting_item_links', { meeting_item_id: item.id, meeting_id: m.id });
        }
      });
      A.meeting = m.id;
      renderApp();
    });
    document.getElementById('addMtgBtn')?.addEventListener('click', createMeeting);
    document.getElementById('mainBtn')?.addEventListener('click', createMeeting);
    return;
  }

  // ── CONTACTS ──────────────────────────────────────────────────────────────
  if (A.view === 'contacts') {
    mount.innerHTML = `<div id="contactsMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>`;
    renderContacts({
      mount:            document.getElementById('contactsMount'),
      people:           db.all('people'),
      project_contacts: db.all('project_contacts'),
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
    <div style="padding-top:14px;border-top:1px solid rgba(0,0,0,.06);margin-top:14px">
      <button id="delTask" style="font-size:11px;color:#9CA3AF;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:5px">
        <i class="ti ti-trash" style="font-size:13px"></i>Delete task</button>
    </div>
  </div>`;

  const on = (id, ev, fn) => { const n=document.getElementById(id); if(n)n.addEventListener(ev,fn); };
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
  const hz = e.target.closest('[data-hz]');
  if (hz) { A.horizon=+hz.dataset.hz; renderApp(); return; }
});
document.addEventListener('change', e => {
  if (e.target.id==='laneSel') { A.lane=e.target.value; renderApp(); }
});
document.addEventListener('keydown', e => { if(e.key==='Escape'){ A.sel=null; renderPanel(); } });

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
      document.body.innerHTML = SHELL;
      showLoading('Loading projects…');
      await db.loadOverview();
      renderApp();
    });
    return;
  }

  currentUserId = session.user.id;
  showLoading('Loading projects…');
  await db.loadOverview();
  renderApp();
}

boot();
