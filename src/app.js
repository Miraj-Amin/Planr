// app.js — entry point. Checks auth first, then wires services → views.
import { db, supabase } from './services/db.js';
import { TaskService }  from './services/taskService.js';
import { RollupService } from './services/rollupService.js';
import { renderPlan }   from './views/planView.js';
import { showAuth }     from './views/authView.js';

const taskSvc  = new TaskService(db);
const rollup   = new RollupService(db);

const VIEWS = [
  { id:'plan',     icon:'ti-subtask',        label:'Plan' },
  { id:'board',    icon:'ti-layout-kanban',  label:'Board' },
  { id:'focus',    icon:'ti-sun',            label:'Focus' },
  { id:'meetings', icon:'ti-notebook',       label:'Meetings' },
];

let A = { view:'plan', project:'b0000001-0000-0000-0000-000000000001', sel:null };

// ─── loading state ────────────────────────────────────────────────────────────
function showLoading(msg) {
  document.getElementById('view').innerHTML =
    `<div style="flex:1;display:flex;align-items:center;justify-content:center;gap:12px;color:#9CA3AF;font-size:13px">
      <i class="ti ti-loader-2" style="font-size:18px;animation:spin .8s linear infinite"></i>${msg||'Loading…'}
    </div>`;
  if (!document.getElementById('spinStyle')) {
    const s = document.createElement('style');
    s.id = 'spinStyle';
    s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }
}

// ─── shell ─────────────────────────────────────────────────────────────────
function renderShell() {
  document.getElementById('rnav').innerHTML = VIEWS.map(v =>
    `<div class="ri ${A.view===v.id?'on':''}" data-view="${v.id}" title="${v.label}"><i class="ti ${v.icon}"></i></div>`).join('');

  const projects = db.all('projects');
  document.getElementById('projSel').innerHTML = projects.map(p =>
    `<option value="${p.id}" ${p.id===A.project?'selected':''}>${p.name}</option>`).join('');

  document.getElementById('tabset').innerHTML = VIEWS.map(v =>
    `<div class="tab ${A.view===v.id?'on':''}" data-view="${v.id}">${v.label}</div>`).join('');

  // sign-out button in rail bottom
  const signout = document.getElementById('signOutBtn');
  if (!signout) {
    const btn = document.createElement('div');
    btn.id = 'signOutBtn';
    btn.className = 'ri';
    btn.title = 'Sign out';
    btn.innerHTML = '<i class="ti ti-logout"></i>';
    btn.onclick = async () => { await supabase.auth.signOut(); location.reload(); };
    document.querySelector('.rail').appendChild(btn);
  }
}

// ─── project start date ───────────────────────────────────────────────────
function projectStart(pid) {
  const dates = db.where('tasks', t => t.project_id === pid && t.start_date)
    .map(t => t.start_date).sort();
  return dates[0] || new Date().toISOString().slice(0,10);
}

// ─── main render ─────────────────────────────────────────────────────────────
function render() {
  renderShell();
  const view = document.getElementById('view');

  if (A.view === 'plan') {
    const tasks = db.all('tasks').filter(t => t.project_id === A.project);
    const deps  = db.all('dependencies').filter(d => d.project_id === A.project);
    const { resolved, critical } = taskSvc.reschedule(A.project, projectStart(A.project));

    view.innerHTML = `
      <div id="planMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>
      <div class="legend">
        <b>Dependencies</b>
        <span class="mono" style="color:#534AB7">FS</span><span>finish→start</span>
        <span class="mono" style="color:#534AB7">SS</span><span>start→start</span>
        <span class="mono" style="color:#534AB7">FF</span><span>finish→finish</span>
        <span class="mono" style="color:#534AB7">SF</span><span>start→finish</span>
        <span style="margin-left:auto"></span>
        <span class="lg-item"><span class="pv-dep crit" style="font-size:8px">FS</span> critical path</span>
      </div>`;

    renderPlan({
      mount:      document.getElementById('planMount'),
      tasks, deps, resolved, critical,
      people:     db.all('people'),
      selectedId: A.sel,
      onSelect:   id => { A.sel = A.sel === id ? null : id; render(); },
    });

  } else {
    view.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:#9CA3AF;font-size:13px">
      ${VIEWS.find(v=>v.id===A.view)?.label} view — coming next.</div>`;
  }

  renderPanel();
}

// ─── panel ────────────────────────────────────────────────────────────────────
function renderPanel() {
  const p = document.getElementById('panel');
  const t = A.sel ? db.get('tasks', A.sel) : null;
  if (!t) { p.classList.remove('open'); return; }
  p.classList.add('open');

  const people = db.all('people');
  const preds  = taskSvc.predecessorsOf(t.id);
  const succs  = taskSvc.successorsOf(t.id);
  const av = pid => {
    const pp = people.find(x => x.id === pid);
    return pp ? `<span class="av" style="width:20px;height:20px;font-size:8px;background:${pp.color}">${pp.initials}</span>` : '';
  };
  const candidates = db.all('tasks').filter(x =>
    x.project_id === A.project && x.id !== t.id &&
    x.type !== 'followup' && x.type !== 'agenda');
  const ps = projectStart(A.project);

  document.getElementById('panelIn').innerHTML = `
    <div class="ph2">
      <span class="ph-x" id="pX"><i class="ti ti-x" style="font-size:14px"></i></span>
      <div style="font-size:14px;font-weight:500;line-height:1.35;padding-right:26px;margin-bottom:12px">${t.name}</div>
      <div class="pf"><span class="pf-l">Type</span><span class="pf-v" style="text-transform:capitalize">${t.type}</span></div>
      <div class="pf"><span class="pf-l">Status</span><span class="pf-v">
        <select id="fStatus">
          ${['todo','in-progress','blocked','review','done'].map(s=>
            `<option value="${s}" ${s===t.status?'selected':''}>${s}</option>`).join('')}
        </select></span></div>
      <div class="pf"><span class="pf-l">Owner</span><span class="pf-v">${av(t.owner_id)}
        <select id="fOwner">
          <option value="">Unassigned</option>
          ${people.map(pp=>`<option value="${pp.id}" ${pp.id===t.owner_id?'selected':''}>${pp.name}${pp.is_client?' (client)':''}</option>`).join('')}
        </select></span></div>
      <div class="pf"><span class="pf-l">Duration</span><span class="pf-v">
        <input id="fDur" type="number" min="0" value="${t.duration_days||''}" style="width:70px;border:.5px solid rgba(0,0,0,.18);border-radius:6px;padding:4px 8px;font-size:12px;outline:none"> working days</span></div>
      <div class="pf"><span class="pf-l">Start</span><span class="pf-v">
        <input id="fStart" type="date" value="${t.start_date||''}" style="border:.5px solid rgba(0,0,0,.18);border-radius:6px;padding:4px 8px;font-size:12px;outline:none"></span></div>
      <div class="pf"><span class="pf-l">Due</span><span class="pf-v">
        <input id="fEnd" type="date" value="${t.end_date||''}" style="border:.5px solid rgba(0,0,0,.18);border-radius:6px;padding:4px 8px;font-size:12px;outline:none"></span></div>
      <div class="pf"><span class="pf-l">Effort</span><span class="pf-v">
        <select id="fEff">
          <option value="0">Not estimated</option>
          ${[{v:15,l:'15m'},{v:30,l:'30m'},{v:60,l:'1h'},{v:120,l:'2h'},{v:240,l:'4h'},{v:480,l:'1d'}]
            .map(e=>`<option value="${e.v}" ${e.v===t.effort_min?'selected':''}>${e.l}</option>`).join('')}
        </select></span></div>
      <div class="pf"><span class="pf-l">Priority</span><span class="pf-v">
        <select id="fPri">
          ${['urgent','high','normal','low'].map(p=>`<option value="${p}" ${p===t.priority?'selected':''}>${p}</option>`).join('')}
        </select></span></div>

      <div class="psec-h">Predecessors — this task starts after</div>
      ${preds.length
        ? preds.map(x=>`<div class="dep-item">
            <span class="dep-kind">${x.dep.type}${x.dep.lag_days?(x.dep.lag_days>0?' +'+x.dep.lag_days:' '+x.dep.lag_days):''}</span>
            ${x.task.name}
            <span class="dep-rm" data-rmdep="${x.dep.id}"><i class="ti ti-x"></i></span>
          </div>`).join('')
        : `<div style="font-size:11px;color:#9CA3AF;padding:4px 0">No predecessors — starts freely.</div>`}
      <div class="dep-add">
        <select id="depTask">
          <option value="">Add predecessor…</option>
          ${candidates.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
        <select id="depType">
          ${['FS','SS','FF','SF'].map(d=>`<option value="${d}">${d}</option>`).join('')}
        </select>
        <input id="depLag" type="number" value="0" style="width:46px;border:.5px solid rgba(0,0,0,.18);border-radius:5px;padding:4px;font-size:11px;text-align:center" title="Lag days">
        <button id="depAdd">Link</button>
      </div>

      ${succs.length ? `
        <div class="psec-h">Successors — these wait on this task</div>
        ${succs.map(x=>`<div class="dep-item"><span class="dep-kind">${x.dep.type}</span>${x.task.name}</div>`).join('')}
      ` : ''}

      ${t.notes ? `<div class="psec-h">Notes</div><div style="font-size:12px;color:#6B7280;line-height:1.6">${t.notes}</div>` : ''}
    </div>`;

  const on = (id, ev, fn) => { const n = document.getElementById(id); if (n) n.addEventListener(ev, fn); };
  on('pX',      'click', () => { A.sel = null; render(); });
  on('fStatus', 'change', e => { db.update('tasks', t.id, { status: e.target.value, progress: e.target.value==='done'?100:t.progress }); render(); });
  on('fOwner',  'change', e => { db.update('tasks', t.id, { owner_id: e.target.value||null }); render(); });
  on('fEff',    'change', e => { db.update('tasks', t.id, { effort_min: +e.target.value }); render(); });
  on('fPri',    'change', e => { db.update('tasks', t.id, { priority: e.target.value }); render(); });
  on('fDur',    'change', e => { taskSvc.setDuration(t.id, A.project, ps, +e.target.value); render(); });
  on('fStart',  'change', e => { taskSvc.setDates(t.id, A.project, ps, e.target.value||null, t.end_date); render(); });
  on('fEnd',    'change', e => { taskSvc.setDates(t.id, A.project, ps, t.start_date, e.target.value||null); render(); });
  on('depAdd',  'click',  () => {
    const pid = document.getElementById('depTask')?.value;
    const ty  = document.getElementById('depType')?.value;
    const lag = +(document.getElementById('depLag')?.value || 0);
    if (!pid) return;
    try { taskSvc.addDependency(A.project, pid, t.id, ty, lag, ps); render(); }
    catch(err) { alert(err.message); }
  });
  document.querySelectorAll('[data-rmdep]').forEach(n =>
    n.addEventListener('click', () => { taskSvc.removeDependency(n.dataset.rmdep, A.project, ps); render(); }));
}

// ─── events ──────────────────────────────────────────────────────────────────
document.addEventListener('click', async e => {
  const v = e.target.closest('[data-view]');
  if (v) { A.view = v.dataset.view; A.sel = null; render(); }
});
document.addEventListener('change', async e => {
  if (e.target.id === 'projSel') {
    A.project = e.target.value; A.sel = null;
    showLoading('Loading project…');
    await db.load(A.project);
    render();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { A.sel = null; render(); } });

// ─── boot ────────────────────────────────────────────────────────────────────
async function boot() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    showAuth(supabase, async (user) => {
      // rebuild the app shell (auth view replaced document.body)
      document.body.innerHTML = `
        <div class="app">
          <div class="rail">
            <div class="logo">P</div>
            <div id="rnav" style="display:flex;flex-direction:column;gap:2px;align-items:center"></div>
            <div style="flex:1"></div>
          </div>
          <div class="main">
            <div class="top">
              <div class="crumb"><span class="dim">Projects</span><i class="ti ti-chevron-right"></i><select id="projSel"></select></div>
              <button class="btn"><i class="ti ti-plus" style="font-size:11px"></i>New task</button>
            </div>
            <div class="tabs"><div id="tabset" style="display:flex"></div></div>
            <div class="view" id="view"></div>
            <div class="panel" id="panel"><div id="panelIn"></div></div>
          </div>
        </div>`;
      showLoading('Loading workspace…');
      await db.load(A.project);
      render();
    });
    return;
  }

  showLoading('Loading workspace…');
  await db.load(A.project);
  render();
}

boot();
