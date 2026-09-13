// boardView.js — Sprint board with drag-and-drop kanban columns.
import { fmt } from '../lib/dates.js';

const STATUSES=[
  {id:'todo',       label:'To do',       color:'#A0A7B4'},
  {id:'in-progress',label:'In progress', color:'#7F77DD'},
  {id:'blocked',    label:'Blocked',     color:'#E24B4A'},
  {id:'review',     label:'Review',      color:'#BA7517'},
  {id:'done',       label:'Done',        color:'#1D9E75'}
];
const EFFORT=[{v:15,l:'15m'},{v:30,l:'30m'},{v:60,l:'1h'},{v:120,l:'2h'},{v:240,l:'4h'},{v:480,l:'1d'}];
const effLabel=m=>{if(!m)return'—';const e=EFFORT.find(x=>x.v===m);if(e)return e.l;return m>=480?(m/480)+'d':m>=60?(m/60)+'h':m+'m';};
const effSum=a=>{const t=a.reduce((s,x)=>s+(x.effort_min||0),0);return t?effLabel(t>=480&&t%480===0?t:t):'';};

const TYPES={
  phase:      {label:'Phase',      color:'#7F77DD',icon:'ti-layers-intersect'},
  task:       {label:'Task',       color:'#6B7280',icon:'ti-square'},
  milestone:  {label:'Milestone',  color:'#BA7517',icon:'ti-diamond'},
  deliverable:{label:'Deliverable',color:'#1D9E75',icon:'ti-package'},
  agenda:     {label:'Agenda',     color:'#378ADD',icon:'ti-message-circle'},
  followup:   {label:'Follow-up',  color:'#D4716A',icon:'ti-arrow-forward'}
};
const T=t=>TYPES[t]||TYPES.task;
const S=id=>STATUSES.find(s=>s.id===id)||STATUSES[0];
const PRIORITY={urgent:{l:'Urgent',c:'#E24B4A'},high:{l:'High',c:'#BA7517'},normal:{l:'Normal',c:'#9CA3AF'},low:{l:'Low',c:'#D1D5DB'}};

const TODAY=new Date(2026,8,13);
const isOverdue=t=>{const d=t.end_date?new Date(t.end_date+'T00:00:00'):null;return !!d&&d<TODAY&&t.status!=='done';};
const isSoon=t=>{const d=t.end_date?new Date(t.end_date+'T00:00:00'):null;if(!d||t.status==='done')return false;const k=Math.round((d-TODAY)/86400000);return k>=0&&k<=3;};
const isClientOwned=(t,people)=>{const o=people.find(p=>p.id===t.owner_id);return !!(o&&o.is_client);};
const clientNoDate=(t,people)=>isClientOwned(t,people)&&!t.end_date&&t.status!=='done';

function avatar(p,cls=''){return p?`<div class="av ${cls}" style="background:${p.color}" title="${p.name}">${p.initials}</div>`:'';}

function cardHTML(t,people,selId,dl){
  const o=people.find(p=>p.id===t.owner_id);
  const ty=T(t.type);
  const over=isOverdue(t),soon=isSoon(t),cnd=clientNoDate(t,people);
  const stripe=cnd||over?(over?'s-over':'s-client'):isClientOwned(t,people)?'s-client':t.status==='in-progress'?'s-prog':'s-none';
  const kids=[];
  const pr=PRIORITY[t.priority];
  let due='';
  if(cnd)due=`<span class="mchip nodate"><i class="ti ti-alert-triangle"></i>No due date</span>`;
  else if(t.end_date)due=`<span class="mchip ${over?'over':soon?'soon':''}">${fmt(t.end_date)}</span>`;
  return `<div class="card ${stripe} ${selId===t.id?'sel':''}" draggable="true" data-task="${t.id}">
    <div class="cardtop">
      <span class="chip" style="background:${ty.color}1a;color:${ty.color}"><i class="ti ${ty.icon}"></i>${ty.label}</span>
      ${isClientOwned(t,people)?`<span class="chip" style="background:rgba(186,117,23,.12);color:#854F0B"><i class="ti ti-user-star"></i>Client</span>`:''}
      ${t.priority&&t.priority!=='normal'?`<span class="chip" style="background:${pr.c}1a;color:${pr.c}"><i class="ti ti-flag-3"></i>${pr.l}</span>`:''}
      ${t.flagged?`<span class="chip" style="background:rgba(186,117,23,.12);color:#854F0B"><i class="ti ti-message-circle"></i>Agenda</span>`:''}
    </div>
    ${dl?`<div class="deliv"><i class="ti ti-package"></i><span>${dl.name}</span></div>`:''}
    <div class="cardname">${t.name}</div>
    <div class="cardmeta">${avatar(o,'')}<span class="cardspacer"></span>${due}</div>
  </div>`;
}

function colHTML(st,ts,people,selId,deliverables){
  const list=ts.filter(t=>t.status===st.id);
  const eff=list.reduce((s,x)=>s+(x.effort_min||0),0);
  return `<div class="col" data-col="${st.id}">
    <div class="colh">
      <div class="coldot" style="background:${st.color}"></div>
      <div class="colname">${st.label}</div>
      <div class="colcount">${list.length}</div>
      ${eff?`<div class="coleff">${effLabel(eff)}</div>`:''}
    </div>
    <div class="colbody" data-drop="${st.id}">
      ${list.map(t=>cardHTML(t,people,selId,t.deliverable_id?deliverables.find(d=>d.id===t.deliverable_id):null)).join('')}
    </div>
    <div class="coladd"><i class="ti ti-plus" style="font-size:11px"></i>Add task</div>
  </div>`;
}

let dragId=null;

export function renderBoard({mount,tasks,people,deliverables,sprints,selId,lane,hideAgenda,onSelect,onStatusChange}){
  const activeSprint=sprints.find(s=>s.is_active)||sprints[0];
  let ts=tasks.filter(t=>t.type!=='phase'&&t.type!=='milestone');
  if(activeSprint)ts=ts.filter(t=>t.sprint_id===activeSprint.id);
  if(hideAgenda)ts=ts.filter(t=>t.type!=='agenda');

  const risky=ts.filter(t=>clientNoDate(t,people));
  const banner=risky.length?`<div class="banner"><i class="ti ti-alert-triangle"></i>
    <span><b>${risky.length} client-owned item${risky.length>1?'s':''}</b> ${risky.length>1?'have':'has'} no agreed due date.</span></div>`:'';

  if(!lane||lane==='none'){
    mount.innerHTML=banner+`<div class="board">${STATUSES.map(s=>colHTML(s,ts,people,selId,deliverables)).join('')}</div>`;
  } else {
    const groups=new Map();
    ts.forEach(t=>{
      let k='—',n='Unassigned';
      if(lane==='deliverable'){const d=t.deliverable_id?deliverables.find(x=>x.id===t.deliverable_id):null;k=d?d.id:'none';n=d?d.name:'No deliverable';}
      else if(lane==='owner'){const o=people.find(p=>p.id===t.owner_id);k=o?o.id:'none';n=o?o.name:'Unassigned';}
      else if(lane==='type'){k=t.type;n=T(t.type).label;}
      if(!groups.has(k))groups.set(k,{name:n,items:[]});
      groups.get(k).items.push(t);
    });
    let html=banner+`<div style="flex:1;overflow:auto;background:var(--page);padding-bottom:20px">`;
    groups.forEach((g)=>{
      html+=`<div class="lane"><div class="laneh"><i class="ti ti-chevron-down" style="font-size:11px;color:var(--ink3)"></i>
        <span class="lanename">${g.name}</span><span class="lanecount">${g.items.length}</span></div>
        <div class="board" style="padding-top:0;padding-bottom:4px">${STATUSES.map(s=>colHTML(s,g.items,people,selId,deliverables)).join('')}</div></div>`;
    });
    mount.innerHTML=html+`</div>`;
  }

  mount.querySelectorAll('.coladd').forEach(b=>{
    b.addEventListener('click',()=>onAddTask&&onAddTask(b.closest('[data-col]')?.dataset.col||'todo'));
  });
  mount.querySelectorAll('.card').forEach(c=>{
    c.addEventListener('dragstart',e=>{dragId=c.dataset.task;c.classList.add('drag');e.dataTransfer.effectAllowed='move';});
    c.addEventListener('dragend',()=>{c.classList.remove('drag');dragId=null;mount.querySelectorAll('.colbody').forEach(b=>b.classList.remove('over'));});
    c.addEventListener('click',()=>onSelect(c.dataset.task));
  });
  mount.querySelectorAll('.colbody').forEach(b=>{
    b.addEventListener('dragover',e=>{e.preventDefault();b.classList.add('over');});
    b.addEventListener('dragleave',()=>b.classList.remove('over'));
    b.addEventListener('drop',e=>{
      e.preventDefault();b.classList.remove('over');
      if(!dragId)return;
      const st=b.dataset.drop;
      onStatusChange(dragId,st);
    });
  });
}
