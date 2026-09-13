// app.js — entry point. Wires services to views, owns app state.
import { db } from './services/db.js';
import { TaskService } from './services/taskService.js';
import { RollupService } from './services/rollupService.js';
import { renderPlan } from './views/planView.js';
import { fmt, fmtLong } from './lib/dates.js';

const taskSvc = new TaskService(db);
const rollup  = new RollupService(db);

const VIEWS = [
  { id:'plan',     icon:'ti-subtask',        label:'Plan' },
  { id:'board',    icon:'ti-layout-kanban',  label:'Board' },
  { id:'focus',    icon:'ti-sun',            label:'Focus' },
  { id:'meetings', icon:'ti-notebook',       label:'Meetings' },
];
const DEP_TYPES = ['FS','SS','FF','SF'];

const A = { view:'plan', project:'pr1', sel:null };

function projectStart(pid){
  const ts = db.where('tasks', t => t.project_id===pid && t.start_date);
  const dates = ts.map(t=>t.start_date).sort();
  return dates[0] || '2026-09-14';
}

function renderShell(){
  document.getElementById('rnav').innerHTML = VIEWS.map(v =>
    `<div class="ri ${A.view===v.id?'on':''}" data-view="${v.id}" title="${v.label}"><i class="ti ${v.icon}"></i></div>`).join('');
  document.getElementById('projSel').innerHTML = db.all('projects').map(p =>
    `<option value="${p.id}" ${p.id===A.project?'selected':''}>${p.name}</option>`).join('');
  document.getElementById('tabset').innerHTML = VIEWS.map(v =>
    `<div class="tab ${A.view===v.id?'on':''}" data-view="${v.id}">${v.label}</div>`).join('');
}

function render(){
  renderShell();
  const view = document.getElementById('view');
  if (A.view === 'plan') {
    const tasks = db.where('tasks', t => t.project_id===A.project);
    const deps  = db.where('dependencies', d => d.project_id===A.project);
    const { resolved, critical } = taskSvc.reschedule(A.project, projectStart(A.project));
    view.innerHTML = `<div class="pv-mount" id="planMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>
      <div class="legend">
        <b>Dependencies</b>
        <span class="lg-item mono" style="color:var(--acc)">FS</span><span>finish→start</span>
        <span class="lg-item mono" style="color:var(--acc)">SS</span><span>start→start</span>
        <span class="lg-item mono" style="color:var(--acc)">FF</span><span>finish→finish</span>
        <span class="lg-item mono" style="color:var(--acc)">SF</span><span>start→finish</span>
        <span style="margin-left:auto"></span>
        <span class="lg-item"><span class="pv-dep crit" style="font-size:8px">FS</span>critical path</span>
      </div>`;
    renderPlan({
      mount: document.getElementById('planMount'),
      tasks, deps, resolved, critical,
      people: db.all('people'),
      selectedId: A.sel,
      onSelect: id => { A.sel = A.sel===id?null:id; render(); },
    });
  } else {
    view.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--ink3);font-size:13px">
      ${VIEWS.find(v=>v.id===A.view).label} view — same board/focus/meetings as the prototype, wired to these services.</div>`;
  }
  renderPanel();
}

function renderPanel(){
  const p = document.getElementById('panel');
  const t = A.sel ? db.get('tasks', A.sel) : null;
  if (!t) { p.classList.remove('open'); return; }
  p.classList.add('open');
  const people = db.all('people');
  const preds = taskSvc.predecessorsOf(t.id);
  const succs = taskSvc.successorsOf(t.id);
  const av = pid => { const pp = people.find(x=>x.id===pid); return pp
    ? `<span class="av" style="width:20px;height:20px;font-size:8px;background:${pp.color}">${pp.initials}</span>` : ''; };
  const candidates = db.where('tasks', x => x.project_id===A.project && x.id!==t.id && x.type!=='followup' && x.type!=='agenda');

  document.getElementById('panelIn').innerHTML = `
    <div class="ph2">
      <span class="ph-x" id="pX"><i class="ti ti-x" style="font-size:14px"></i></span>
      <div style="font-size:14px;font-weight:500;line-height:1.35;padding-right:26px;margin-bottom:12px">${t.name}</div>
      <div class="pf"><span class="pf-l">Type</span><span class="pf-v" style="text-transform:capitalize">${t.type}</span></div>
      <div class="pf"><span class="pf-l">Owner</span><span class="pf-v">${av(t.owner_id)}
        <select id="fOwner"><option value="">Unassigned</option>${people.map(pp=>`<option value="${pp.id}" ${pp.id===t.owner_id?'selected':''}>${pp.name}</option>`).join('')}</select></span></div>
      <div class="pf"><span class="pf-l">Duration</span><span class="pf-v"><input id="fDur" type="number" min="0" value="${t.duration_days||''}" style="width:70px"> working days</span></div>
      <div class="pf"><span class="pf-l">Start</span><span class="pf-v"><input id="fStart" type="date" value="${t.start_date||''}"></span></div>
      <div class="pf"><span class="pf-l">Due</span><span class="pf-v"><input id="fEnd" type="date" value="${t.end_date||''}"></span></div>

      <div class="psec-h">Predecessors — this starts after</div>
      ${preds.length?preds.map(x=>`<div class="dep-item"><span class="kind">${x.dep.type}${x.dep.lag_days?(x.dep.lag_days>0?' +'+x.dep.lag_days:' '+x.dep.lag_days):''}</span>${x.task.name}<span class="dep-rm" data-rmdep="${x.dep.id}"><i class="ti ti-x"></i></span></div>`).join(''):'<div style="font-size:11px;color:var(--ink3);padding:4px 0">No predecessors — starts freely.</div>'}
      <div class="dep-add">
        <select id="depTask"><option value="">Add predecessor…</option>${candidates.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select>
        <select id="depType">${DEP_TYPES.map(d=>`<option value="${d}">${d}</option>`).join('')}</select>
        <button id="depAdd">Link</button>
      </div>

      ${succs.length?`<div class="psec-h">Successors — these wait on this</div>${succs.map(x=>`<div class="dep-item"><span class="kind">${x.dep.type}</span>${x.task.name}</div>`).join('')}`:''}
    </div>`;

  const on=(id,ev,fn)=>{const n=document.getElementById(id);if(n)n.addEventListener(ev,fn);};
  const ps = projectStart(A.project);
  on('pX','click',()=>{A.sel=null;render();});
  on('fOwner','change',e=>{db.update('tasks',t.id,{owner_id:e.target.value||null});render();});
  on('fDur','change',e=>{taskSvc.setDuration(t.id,A.project,ps,+e.target.value);render();});
  on('fStart','change',e=>{taskSvc.setDates(t.id,A.project,ps,e.target.value||null,t.end_date);render();});
  on('fEnd','change',e=>{taskSvc.setDates(t.id,A.project,ps,t.start_date,e.target.value||null);render();});
  on('depAdd','click',()=>{
    const pid=document.getElementById('depTask').value, ty=document.getElementById('depType').value;
    if(!pid)return;
    try{ taskSvc.addDependency(A.project,pid,t.id,ty,0,ps); render(); }
    catch(err){ alert(err.message); }
  });
  document.querySelectorAll('[data-rmdep]').forEach(n=>n.addEventListener('click',()=>{
    taskSvc.removeDependency(n.dataset.rmdep,A.project,ps); render();
  }));
}

document.addEventListener('click',e=>{
  const v=e.target.closest('[data-view]');
  if(v){ A.view=v.dataset.view; A.sel=null; render(); }
});
document.addEventListener('change',e=>{
  if(e.target.id==='projSel'){ A.project=e.target.value; A.sel=null; render(); }
});
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){A.sel=null;render();} });

render();
