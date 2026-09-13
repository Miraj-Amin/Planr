// focusView.js — Horizon view: overdue, client no-date, due within N days.
import { fmt } from '../lib/dates.js';

const TODAY=new Date(2026,8,13);
const pd=s=>s?new Date(s+'T00:00:00'):null;
const EFFORT=[{v:15,l:'15m'},{v:30,l:'30m'},{v:60,l:'1h'},{v:120,l:'2h'},{v:240,l:'4h'},{v:480,l:'1d'}];
const effLabel=m=>{if(!m)return'';const e=EFFORT.find(x=>x.v===m);if(e)return e.l;return m>=480?(m/480)+'d':m>=60?(m/60)+'h':m+'m';};
const STATUSES={todo:'#A0A7B4','in-progress':'#7F77DD',blocked:'#E24B4A',review:'#BA7517',done:'#1D9E75'};
const STATUS_L={todo:'To do','in-progress':'In progress',blocked:'Blocked',review:'Review',done:'Done'};
const TYPES={phase:'#7F77DD',task:'#6B7280',milestone:'#BA7517',deliverable:'#1D9E75',agenda:'#378ADD',followup:'#D4716A'};
const TYPE_I={phase:'ti-layers-intersect',task:'ti-square',milestone:'ti-diamond',deliverable:'ti-package',agenda:'ti-message-circle',followup:'ti-arrow-forward'};

const isClientOwned=(t,people)=>{const o=people.find(p=>p.id===t.owner_id);return !!(o&&o.is_client);};
const isOverdue=t=>{const d=pd(t.end_date);return !!d&&d<TODAY&&t.status!=='done';};
const isSoon=t=>{const d=pd(t.end_date);if(!d||t.status==='done')return false;const k=Math.round((d-TODAY)/86400000);return k>=0&&k<=3;};
const clientNoDate=(t,people)=>isClientOwned(t,people)&&!t.end_date&&t.status!=='done';
const inHorizon=(t,n)=>{const d=pd(t.end_date);if(!d)return false;const k=Math.round((d-TODAY)/86400000);return k>=0&&k<=n;};

function rowHTML(t,people,projects){
  const o=people.find(p=>p.id===t.owner_id);
  const over=isOverdue(t),cnd=clientNoDate(t,people),soon=isSoon(t);
  const strip=over?'#E24B4A':cnd?'#BA7517':t.status==='in-progress'?'#7F77DD':'transparent';
  const dueCol=over||cnd?'#E24B4A':soon?'#BA7517':'#A0A7B4';
  const proj=projects.find(p=>p.id===t.project_id);
  const stColor=STATUSES[t.status]||'#A0A7B4';
  return `<div class="row" data-task="${t.id}">
    <div class="strip" style="background:${strip}"></div>
    <div style="width:22px;flex-shrink:0"></div>
    <div class="dot" style="background:${over?'#E24B4A':stColor}"></div>
    <div class="tico" style="background:${(TYPES[t.type]||'#888')}1a"><i class="ti ${TYPE_I[t.type]||'ti-square'}" style="color:${TYPES[t.type]||'#888'}"></i></div>
    <div class="rname">
      <span class="t">${t.name}</span>
      ${isClientOwned(t,people)?`<span class="chip" style="background:rgba(186,117,23,.12);color:#854F0B"><i class="ti ti-user-star"></i>Client</span>`:''}
      ${t.flagged?`<i class="ti ti-message-circle" style="font-size:12px;color:#BA7517;flex-shrink:0"></i>`:''}
      ${proj?`<span style="font-size:10px;color:#9CA3AF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;flex-shrink:1">${proj.name}</span>`:''}
    </div>
    <div class="rcol rstat"><span class="stat" style="background:${stColor}1a;color:${stColor}">${STATUS_L[t.status]||t.status}</span></div>
    <div class="rcol reff">${effLabel(t.effort_min)}</div>
    <div class="rcol rown">${o?`<div class="av" style="background:${o.color};width:25px;height:25px;font-size:9px">${o.initials}</div>`:''}</div>
    <div class="rcol rdue" style="color:${dueCol}">${cnd?'No date':t.end_date?fmt(t.end_date):'—'}</div>
  </div>`;
}

export function renderFocus({mount,tasks,people,projects,horizon,onSelect}){
  const n=horizon||7;
  const all=tasks.filter(t=>t.type!=='phase'&&t.status!=='done');
  const overdue=all.filter(isOverdue);
  const noDate=all.filter(t=>clientNoDate(t,people));
  const due=all.filter(t=>!isOverdue(t)&&inHorizon(t,n));
  const started=all.filter(t=>!isOverdue(t)&&!inHorizon(t,n)&&t.status==='in-progress'&&!clientNoDate(t,people));

  const grp=(title,items,cls='')=>items.length?
    `<div class="grp ${cls}"><span class="grpname">${title}</span><span class="grpcount">${items.length}</span></div>`
    +items.map(t=>rowHTML(t,people,projects)).join(''):'';

  const total=overdue.length+due.length+noDate.length;
  mount.innerHTML=`
    <div class="banner" style="background:rgba(127,119,221,.06);border-bottom-color:rgba(127,119,221,.15);color:#6B7280">
      <i class="ti ti-target" style="color:#7F77DD"></i>
      <span><b>${total} item${total===1?'':'s'}</b> need attention ${n===1?'today':n===7?'this week':'this month'}.</span>
    </div>
    <div class="scroll">
      ${grp('Overdue',overdue,'danger')}
      ${grp('Client-owned · no agreed date',noDate,'danger')}
      ${grp(n===1?'Due today':`Due within ${n} days`,due)}
      ${grp('In progress · beyond horizon',started)}
      ${total===0&&started.length===0?'<div style="padding:60px;text-align:center;color:#9CA3AF;font-size:13px">Nothing due in this window.</div>':''}
    </div>`;
  mount.querySelectorAll('.row').forEach(r=>r.addEventListener('click',()=>onSelect(r.dataset.task)));
}
