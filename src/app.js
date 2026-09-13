import { db, supabase }    from './services/db.js';
import { TaskService }      from './services/taskService.js';
import { renderPlan }       from './views/planView.js';
import { renderGrid }       from './views/gridView.js';
import { renderBoard }      from './views/boardView.js';
import { renderFocus }      from './views/focusView.js';
import { renderMeetings }   from './views/meetingsView.js';
import { showAuth }         from './views/authView.js';
import { newProjectForm, newTaskForm, newPhaseForm, newDeliverableForm,
         newMeetingForm, newMeetingItemForm, quickTaskForm } from './views/forms.js';

const taskSvc = new TaskService(db);

const VIEWS = [
  { id:'plan',     icon:'ti-subtask',       label:'Plan' },
  { id:'board',    icon:'ti-layout-kanban', label:'Board' },
  { id:'focus',    icon:'ti-sun',           label:'Focus' },
  { id:'meetings', icon:'ti-notebook',      label:'Meetings' },
];

let A = {
  view:'plan', project:null, sel:null, meeting:null,
  horizon:7, lane:'none', hideAgenda:false,
};

// ── loading ────────────────────────────────────────────────────────────────────
function showLoading(msg) {
  const v=document.getElementById('view');
  if(v) v.innerHTML=`<div style="flex:1;display:flex;align-items:center;justify-content:center;gap:12px;color:#9CA3AF;font-size:13px">
    <i class="ti ti-loader-2" style="font-size:18px;animation:spin .8s linear infinite"></i>${msg||'Loading…'}</div>`;
  if(!document.getElementById('spinStyle')){
    const s=document.createElement('style');s.id='spinStyle';
    s.textContent='@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }
}

// ── shell ─────────────────────────────────────────────────────────────────────
function renderShell() {
  document.getElementById('rnav').innerHTML=VIEWS.map(v=>
    `<div class="ri ${A.view===v.id?'on':''}" data-view="${v.id}" title="${v.label}"><i class="ti ${v.icon}"></i></div>`
  ).join('')+`<div style="flex:1"></div>
   <div class="ri" id="signOutBtn" title="Sign out"><i class="ti ti-logout"></i></div>`;

  const projects=db.all('projects');
  document.getElementById('projSel').innerHTML=
    projects.map(p=>`<option value="${p.id}" ${p.id===A.project?'selected':''}>${p.name}</option>`).join('')
    +`<option value="__new" style="color:#534AB7">+ New project</option>`;

  document.getElementById('tabset').innerHTML=VIEWS.map(v=>
    `<div class="tab ${A.view===v.id?'on':''}" data-view="${v.id}">${v.label}</div>`).join('');

  document.getElementById('tools').innerHTML=toolsHTML();

  document.getElementById('signOutBtn')?.addEventListener('click',async()=>{
    await supabase.auth.signOut(); location.reload();
  });
}

function toolsHTML(){
  if(A.view==='plan') return `
    <button class="btn ghost" id="addPhaseBtn"><i class="ti ti-plus" style="font-size:11px"></i>Phase</button>
    <button class="btn ghost" id="addDlBtn"><i class="ti ti-plus" style="font-size:11px"></i>Deliverable</button>`;
  if(A.view==='board') return `
    <select id="laneSel" style="height:24px;border:.5px solid rgba(0,0,0,.13);border-radius:6px;font-size:11px;color:#6B7280;background:#fff;padding:0 6px;cursor:pointer;outline:none">
      <option value="none" ${A.lane==='none'?'selected':''}>No swimlanes</option>
      <option value="deliverable" ${A.lane==='deliverable'?'selected':''}>By deliverable</option>
      <option value="owner" ${A.lane==='owner'?'selected':''}>By owner</option>
      <option value="type" ${A.lane==='type'?'selected':''}>By type</option>
    </select>
    <button class="btn ghost ${A.hideAgenda?'on':''}" id="agendaTgl">
      <i class="ti ti-message-circle" style="font-size:11px"></i>${A.hideAgenda?'Agenda hidden':'Show agenda'}</button>`;
  if(A.view==='focus') return [1,7,30].map(n=>
    `<button class="btn ghost ${A.horizon===n?'on':''}" data-hz="${n}">${n===1?'Today':n===7?'This week':'This month'}</button>`).join('');
  if(A.view==='meetings') return `
    <button class="btn ghost" id="addMtgBtn"><i class="ti ti-plus" style="font-size:11px"></i>New meeting</button>`;
  return '';
}

// ── helpers ────────────────────────────────────────────────────────────────────
const projTasks=()=>db.all('tasks').filter(t=>t.project_id===A.project);
const projDeps= ()=>db.all('dependencies').filter(d=>d.project_id===A.project);
const projStart=()=>{ const d=projTasks().map(t=>t.start_date).filter(Boolean).sort();
  return d[0]||new Date().toISOString().slice(0,10); };
const people=()=>db.all('people');

// ── main render ────────────────────────────────────────────────────────────────
function render(){
  if(!A.project){
    // no projects yet — show empty state
    document.getElementById('rnav').innerHTML='';
    document.getElementById('projSel').innerHTML=`<option value="__new">+ New project</option>`;
    document.getElementById('tabset').innerHTML='';
    document.getElementById('tools').innerHTML='';
    document.getElementById('view').innerHTML=`
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#9CA3AF">
        <div style="font-size:32px;opacity:.3"><i class="ti ti-layout-kanban"></i></div>
        <div style="font-size:14px;font-weight:500;color:#6B7280">No projects yet</div>
        <button id="firstProjBtn" style="height:36px;padding:0 20px;background:#534AB7;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer">
          <i class="ti ti-plus" style="font-size:12px;margin-right:6px"></i>Create your first project</button>
      </div>`;
    document.getElementById('firstProjBtn')?.addEventListener('click',()=>createProject());
    return;
  }

  renderShell();
  const mount=document.getElementById('view');

  if(A.view==='plan'){
    mount.innerHTML=`<div id="gridMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>`;
    function rerender(afterFn){
      // reload from db cache and re-render grid
      const t2=projTasks(),d2=db.all('deliverables').filter(d=>d.project_id===A.project),
            s2=db.all('sprints').filter(s=>s.project_id===A.project);
      renderGrid({mount:document.getElementById('gridMount'),tasks:t2,people:people(),
        deliverables:d2,sprints:s2,db,projectId:A.project,
        onSelect:id=>{A.sel=A.sel===id?null:id;renderPanel();},
        onRerender:fn=>{ rerender(fn); }});
      if(afterFn) requestAnimationFrame(afterFn);
    }
    renderGrid({mount:document.getElementById('gridMount'),tasks:projTasks(),people:people(),
      deliverables:db.all('deliverables').filter(d=>d.project_id===A.project),
      sprints:db.all('sprints').filter(s=>s.project_id===A.project),
      db, projectId:A.project,
      onSelect:id=>{A.sel=A.sel===id?null:id;renderPanel();},
      onRerender:(afterFn)=>{ rerender(afterFn); }});
    document.getElementById('addPhaseBtn')?.addEventListener('click',()=>
      newPhaseForm(db,A.project,()=>rerender()));
    document.getElementById('addDlBtn')?.addEventListener('click',()=>
      newDeliverableForm(db,A.project,()=>rerender()));

  } else if(A.view==='board'){
    mount.innerHTML=`<div id="boardMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>`;
    renderBoard({
      mount:document.getElementById('boardMount'),
      tasks:projTasks(),people:people(),
      deliverables:db.all('deliverables').filter(d=>d.project_id===A.project),
      sprints:db.all('sprints').filter(s=>s.project_id===A.project),
      selId:A.sel,lane:A.lane,hideAgenda:A.hideAgenda,
      onSelect:id=>{A.sel=A.sel===id?null:id;render();},
      onStatusChange:(id,status)=>{
        db.update('tasks',id,{status,progress:status==='done'?100:undefined});
        render();
      },
      onAddTask:(status)=>quickTaskForm(db,A.project,{status},()=>render()),
    });

  } else if(A.view==='focus'){
    mount.innerHTML=`<div id="focusMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>`;
    renderFocus({mount:document.getElementById('focusMount'),
      tasks:db.all('tasks'),people:people(),
      projects:db.all('projects'),horizon:A.horizon,
      onSelect:id=>{A.sel=A.sel===id?null:id;render();}});

  } else if(A.view==='meetings'){
    const projMeetings=db.all('meetings').filter(m=>m.project_id===A.project);
    if(!A.meeting&&projMeetings.length) A.meeting=projMeetings[0].id;
    mount.innerHTML=`<div id="mtgMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>`;
    renderMeetings({
      mount:document.getElementById('mtgMount'),
      meetings:projMeetings,
      meeting_items:db.all('meeting_items'),
      meeting_item_links:db.all('meeting_item_links'),
      tasks:projTasks(),people:people(),
      activeMeeting:A.meeting,
      onSelectMeeting:id=>{A.meeting=id;render();},
      onSelectTask:id=>{A.sel=A.sel===id?null:id;render();},
      onAddAgenda:()=>newMeetingItemForm(db,A.project,A.meeting,'agenda',()=>{ db.load(A.project).then(render); }),
      onAddFollowup:()=>newMeetingItemForm(db,A.project,A.meeting,'followup',()=>{ db.load(A.project).then(render); }),
    });
    document.getElementById('addMtgBtn')?.addEventListener('click',()=>
      newMeetingForm(db,A.project,m=>{A.meeting=m.id;render();}));
  }

  renderPanel();

  document.getElementById('agendaTgl')?.addEventListener('click',()=>{A.hideAgenda=!A.hideAgenda;render();});
  document.getElementById('addPhaseBtn')?.addEventListener('click',()=>newPhaseForm(db,A.project,()=>render()));
}

// ── create project ─────────────────────────────────────────────────────────────
function createProject(){
  newProjectForm(db,proj=>{
    A.project=proj.id; A.view='plan'; render();
  });
}

// ── panel ──────────────────────────────────────────────────────────────────────
function renderPanel(){
  const panel=document.getElementById('panel');
  const t=A.sel?db.get('tasks',A.sel):null;
  if(!t){panel.classList.remove('open');return;}
  panel.classList.add('open');
  const ppl=people();
  const preds=taskSvc.predecessorsOf(t.id),succs=taskSvc.successorsOf(t.id);
  const av=pid=>{const pp=ppl.find(x=>x.id===pid);return pp?`<span class="av" style="width:20px;height:20px;font-size:8px;background:${pp.color}">${pp.initials}</span>`:''};
  const candidates=db.all('tasks').filter(x=>x.project_id===A.project&&x.id!==t.id&&x.type!=='followup'&&x.type!=='agenda');
  const ps=projStart();
  const EFFORT=[{v:15,l:'15m'},{v:30,l:'30m'},{v:60,l:'1h'},{v:120,l:'2h'},{v:240,l:'4h'},{v:480,l:'1d'}];
  const deliverables=db.all('deliverables').filter(d=>d.project_id===A.project);
  const sprints=db.all('sprints').filter(s=>s.project_id===A.project);

  document.getElementById('panelIn').innerHTML=`
  <div class="ph2">
    <span class="ph-x" id="pX"><i class="ti ti-x" style="font-size:14px"></i></span>
    <div style="font-size:14px;font-weight:500;line-height:1.35;padding-right:26px;margin-bottom:12px">${t.name}</div>
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
    <div class="pf"><span class="pf-l">Duration</span><span class="pf-v">
      <input id="fDur" type="number" min="0" value="${t.duration_days||''}" style="width:60px;border:.5px solid rgba(0,0,0,.18);border-radius:6px;padding:3px 6px;font-size:12px;outline:none"> days</span></div>
    <div class="pf"><span class="pf-l">Start</span><span class="pf-v">
      <input id="fStart" type="date" value="${t.start_date||''}" style="border:.5px solid rgba(0,0,0,.18);border-radius:6px;padding:3px 6px;font-size:12px;outline:none"></span></div>
    <div class="pf"><span class="pf-l">Due</span><span class="pf-v">
      <input id="fEnd" type="date" value="${t.end_date||''}" style="border:.5px solid rgba(0,0,0,.18);border-radius:6px;padding:3px 6px;font-size:12px;outline:none"></span></div>
    <div class="pf"><span class="pf-l">Flag</span><span class="pf-v">
      <div id="fFlag" style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:8px;font-size:12px;background:${t.flagged?'rgba(186,117,23,.08)':'rgba(0,0,0,.03)'};color:${t.flagged?'#BA7517':'#9CA3AF'}">
        <i class="ti ti-message-circle" style="font-size:13px"></i>${t.flagged?'Flagged for agenda':'Flag for next meeting'}
      </div></span></div>
    ${t.notes?`<div class="psec-h">Notes</div><div style="font-size:12px;color:#6B7280;line-height:1.6;padding:0 0 12px">${t.notes}</div>`:''}
    <div class="psec-h">Predecessors</div>
    ${preds.length
      ?preds.map(x=>`<div class="dep-item"><span class="dep-kind">${x.dep.type}${x.dep.lag_days?(x.dep.lag_days>0?' +'+x.dep.lag_days:' '+x.dep.lag_days):''}</span>${x.task.name}
          <span class="dep-rm" data-rmdep="${x.dep.id}"><i class="ti ti-x"></i></span></div>`).join('')
      :`<div style="font-size:11px;color:#9CA3AF;padding:3px 0">No predecessors.</div>`}
    <div class="dep-add">
      <select id="depTask"><option value="">Add predecessor…</option>
        ${candidates.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select>
      <select id="depType">${['FS','SS','FF','SF'].map(d=>`<option>${d}</option>`).join('')}</select>
      <input id="depLag" type="number" value="0" style="width:40px;border:.5px solid rgba(0,0,0,.18);border-radius:5px;padding:3px;font-size:11px;text-align:center" title="Lag days">
      <button id="depAdd">Link</button>
    </div>
    ${succs.length?`<div class="psec-h">Successors</div>${succs.map(x=>`<div class="dep-item"><span class="dep-kind">${x.dep.type}</span>${x.task.name}</div>`).join('')}`:''}
    <div style="padding-top:16px;border-top:1px solid rgba(0,0,0,.06);margin-top:16px">
      <button id="delTask" style="font-size:11px;color:#9CA3AF;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:5px">
        <i class="ti ti-trash" style="font-size:13px"></i>Delete task</button>
    </div>
  </div>`;

  const on=(id,ev,fn)=>{const n=document.getElementById(id);if(n)n.addEventListener(ev,fn);};
  on('pX','click',()=>{A.sel=null;render();});
  on('fType',  'change',e=>{ db.update('tasks',t.id,{type:e.target.value});render();});
  on('fStatus','change',e=>{ db.update('tasks',t.id,{status:e.target.value,progress:e.target.value==='done'?100:t.progress});render();});
  on('fOwner', 'change',e=>{ db.update('tasks',t.id,{owner_id:e.target.value||null});render();});
  on('fDeliv', 'change',e=>{ db.update('tasks',t.id,{deliverable_id:e.target.value||null});render();});
  on('fSprint','change',e=>{ db.update('tasks',t.id,{sprint_id:e.target.value||null});render();});
  on('fEff',   'change',e=>{ db.update('tasks',t.id,{effort_min:+e.target.value});render();});
  on('fPri',   'change',e=>{ db.update('tasks',t.id,{priority:e.target.value});render();});
  on('fDur',   'change',e=>{ taskSvc.setDuration(t.id,A.project,ps,+e.target.value);render();});
  on('fStart', 'change',e=>{ taskSvc.setDates(t.id,A.project,ps,e.target.value||null,t.end_date);render();});
  on('fEnd',   'change',e=>{ taskSvc.setDates(t.id,A.project,ps,t.start_date,e.target.value||null);render();});
  on('fFlag',  'click', ()=>{ db.update('tasks',t.id,{flagged:!t.flagged});render();});
  on('depAdd', 'click', ()=>{
    const pid=document.getElementById('depTask')?.value;
    const ty=document.getElementById('depType')?.value;
    const lag=+(document.getElementById('depLag')?.value||0);
    if(!pid)return;
    try{taskSvc.addDependency(A.project,pid,t.id,ty,lag,ps);render();}
    catch(err){alert(err.message);}
  });
  on('delTask','click',()=>{
    if(confirm(`Delete "${t.name}"? This can't be undone.`)){
      db.remove('tasks',t.id); A.sel=null; render();
    }
  });
  document.querySelectorAll('[data-rmdep]').forEach(n=>
    n.addEventListener('click',()=>{taskSvc.removeDependency(n.dataset.rmdep,A.project,ps);render();}));
}

// ── events ─────────────────────────────────────────────────────────────────────
document.addEventListener('click',e=>{
  const v=e.target.closest('[data-view]');
  if(v){A.view=v.dataset.view;A.sel=null;render();return;}
  const hz=e.target.closest('[data-hz]');
  if(hz){A.horizon=+hz.dataset.hz;render();return;}
  if(e.target.id==='newTaskBtn'||e.target.closest('#newTaskBtn')){
    newTaskForm(db,A.project,{},()=>render()); return;
  }
});
document.addEventListener('change',async e=>{
  if(e.target.id==='projSel'){
    if(e.target.value==='__new'){createProject();e.target.value=A.project||'';return;}
    A.project=e.target.value;A.sel=null;showLoading('Loading project…');
    await db.load(A.project);render();
  }
  if(e.target.id==='laneSel'){A.lane=e.target.value;render();}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){A.sel=null;render();}});

// wire New task button
document.querySelector('.btn:not(.ghost)')?.addEventListener('click',()=>{
  if(A.project) newTaskForm(db,A.project,{},()=>render());
  else createProject();
});

// ── shell HTML (rebuilt after auth) ───────────────────────────────────────────
const SHELL=`<div class="app">
  <div class="rail">
    <div class="logo">P</div>
    <div id="rnav" style="display:flex;flex-direction:column;gap:2px;align-items:center;width:100%"></div>
  </div>
  <div class="main">
    <div class="top">
      <div class="crumb"><span class="dim">Projects</span><i class="ti ti-chevron-right"></i><select id="projSel"></select></div>
      <div id="tools" style="display:flex;align-items:center;gap:8px"></div>
      <div style="flex:1"></div>
      <button class="btn" id="newTaskBtn"><i class="ti ti-plus" style="font-size:11px"></i>New task</button>
    </div>
    <div class="tabs"><div id="tabset" style="display:flex"></div></div>
    <div class="view" id="view"></div>
    <div class="panel" id="panel"><div id="panelIn"></div></div>
  </div>
</div>`;

function wireNewTaskBtn(){
  document.getElementById('newTaskBtn')?.addEventListener('click',()=>{
    if(A.project) newTaskForm(db,A.project,{},()=>render());
    else createProject();
  });
}

// ── boot ──────────────────────────────────────────────────────────────────────
async function boot(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){
    showAuth(supabase,async()=>{
      document.body.innerHTML=SHELL;
      wireNewTaskBtn();
      showLoading('Loading workspace…');
      const projects=await supabase.from('projects').select('*');
      if(projects.data?.length){
        A.project=projects.data[0].id;
        await db.load(A.project);
      }
      render();
    });
    return;
  }
  showLoading('Loading workspace…');
  try {
    const {data:projects}=await supabase.from('projects').select('*');
    if(projects?.length){
      A.project=projects[0].id;
      await db.load(A.project);
    }
  } catch(e){ console.error('Load error:',e); }
  wireNewTaskBtn();
  render();
}

boot();
