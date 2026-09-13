// meetingsView.js — Meeting log with agenda/follow-up separation,
// carry-forward badges, and client action warnings.
import { fmt, fmtLong } from '../lib/dates.js';

const TODAY=new Date(2026,8,13);
const pd=s=>s?new Date(s+'T00:00:00'):null;
const isOverdue=t=>{const d=pd(t.end_date);return !!d&&d<TODAY&&t.status!=='done';};
const isClient=(t,people)=>{const o=people.find(p=>p.id===t.owner_id);return !!(o&&o.is_client);};
const noDate=(t,people)=>isClient(t,people)&&!t.end_date&&t.status!=='done';

function wrapTime(meeting){
  const [h,m]=meeting.start_time.split(':').map(Number);
  const d=new Date(2000,0,1,h,m+meeting.duration_min-10);
  return d.toTimeString().slice(0,5);
}
function endTime(meeting){
  const [h,m]=meeting.start_time.split(':').map(Number);
  const d=new Date(2000,0,1,h,m+meeting.duration_min);
  return d.toTimeString().slice(0,5);
}

export function renderMeetings({mount,meetings,meeting_items,meeting_item_links,tasks,people,activeMeeting,onSelectMeeting,onSelectTask}){
  const byId=new Map(tasks.map(t=>[t.id,t]));

  function itemsForMeeting(mid){
    const linkIds=new Set(meeting_item_links.filter(l=>l.meeting_id===mid).map(l=>l.meeting_item_id));
    return meeting_items.filter(mi=>linkIds.has(mi.id)).map(mi=>({...mi,task:byId.get(mi.task_id)})).filter(x=>x.task);
  }
  function openCount(mid){return itemsForMeeting(mid).filter(x=>!x.resolved&&x.task.status!=='done').length;}

  const sortedMeetings=[...meetings].sort((a,b)=>b.date.localeCompare(a.date));
  const cur=activeMeeting?meetings.find(m=>m.id===activeMeeting):sortedMeetings[0];

  const listHTML=sortedMeetings.map(m=>{
    const open=openCount(m.id);
    const future=m.date>new Date().toISOString().slice(0,10);
    return `<div class="mtg-li ${cur&&m.id===cur.id?'on':''}" data-mtg="${m.id}">
      <div class="mtg-li-d"><i class="ti ti-calendar" style="font-size:11px"></i>${fmtLong(m.date)}
        ${future?`<span class="chip" style="background:rgba(127,119,221,.08);color:#534AB7">Upcoming</span>`:''}</div>
      <div class="mtg-li-t">${m.title}</div>
      <div class="mtg-li-m">
        <span><i class="ti ti-clock" style="font-size:11px;vertical-align:-2px"></i> ${m.duration_min}m</span>
        ${open?`<span style="color:#BA7517">${open} open</span>`:'<span style="color:#1D9E75">All closed</span>'}
      </div>
    </div>`;
  }).join('');

  let bodyHTML='<div class="empty" style="padding:60px;text-align:center">No meetings yet.</div>';
  if(cur){
    const items=itemsForMeeting(cur.id);
    const agenda=items.filter(x=>x.kind==='agenda');
    const follow=items.filter(x=>x.kind==='followup');
    const att=(cur.attendee_ids||[]).map(id=>people.find(p=>p.id===id)).filter(Boolean);
    const openA=agenda.filter(x=>!(x.resolved||x.task.status==='done')).length;
    const openF=follow.filter(x=>!(x.resolved||x.task.status==='done')).length;

    const itemHTML=x=>{
      const t=x.task,o=people.find(p=>p.id===t.owner_id);
      const done=x.resolved||t.status==='done';
      const cnd=noDate(t,people),over=isOverdue(t);
      const others=meeting_item_links.filter(l=>l.meeting_item_id===x.id&&l.meeting_id!==cur.id).length;
      return `<div class="item" data-task="${t.id}">
        <i class="ti ti-${done?'circle-check':'circle'} ck" style="color:${done?'#1D9E75':'#9CA3AF'}"></i>
        <div class="item-b">
          <div class="item-t ${done?'done':''}">${t.name}</div>
          <div class="item-m">
            ${o?`<div class="av" style="width:17px;height:17px;font-size:7px;background:${o.color}">${o.initials}</div><span>${o.name}</span>`:''}
            ${isClient(t,people)?`<span class="chip" style="background:rgba(186,117,23,.12);color:#854F0B"><i class="ti ti-user-star"></i>Client</span>`:''}
            ${cnd?`<span style="color:#E24B4A;font-weight:500"><i class="ti ti-alert-triangle" style="font-size:11px"></i> No due date</span>`
                 :t.end_date?`<span style="color:${over?'#E24B4A':'#9CA3AF'}">${fmt(t.end_date)}</span>`:''}
            ${x.carried_from?`<span class="carry"><i class="ti ti-arrow-forward" style="font-size:9px"></i>Carried forward</span>`:''}
            ${others?`<span><i class="ti ti-link" style="font-size:11px;vertical-align:-1px"></i> ${others} other meeting${others>1?'s':''}</span>`:''}
          </div>
        </div>
      </div>`;
    };

    bodyHTML=`
    <div class="mtg-head">
      <div class="mtg-title">${cur.title}</div>
      <div class="mtg-facts">
        <div><i class="ti ti-calendar"></i>${fmtLong(cur.date)}</div>
        <div><i class="ti ti-clock"></i>${cur.start_time}–${endTime(cur)} · ${cur.duration_min}m</div>
        <div><i class="ti ti-flag-3"></i>Wrap-up from ${wrapTime(cur)}</div>
        <div style="display:flex;align-items:center;gap:4px"><i class="ti ti-users"></i>
          ${att.map(p=>`<div class="av" style="width:20px;height:20px;font-size:8px;background:${p.color}">${p.initials}</div>`).join('')}
        </div>
      </div>
      ${cur.notes?`<p style="font-size:12px;color:#6B7280;line-height:1.6;margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,.06)">${cur.notes}</p>`:''}
    </div>
    <div class="sec">
      <div class="sech"><i class="ti ti-message-circle" style="font-size:14px;color:#378ADD"></i>
        <span class="secname">Agenda</span>
        <span class="secbadge" style="background:${openA?'rgba(55,138,221,.12)':'rgba(29,158,117,.1)'};color:${openA?'#185FA5':'#1D9E75'}">${openA?openA+' open':'all covered'}</span>
      </div>
      ${agenda.length?agenda.map(itemHTML).join(''):'<div class="empty">No agenda items yet.</div>'}
      <div class="secadd"><i class="ti ti-plus" style="font-size:12px"></i>Add agenda item</div>
    </div>
    <div class="sec">
      <div class="sech"><i class="ti ti-arrow-forward" style="font-size:14px;color:#D4716A"></i>
        <span class="secname">Actions &amp; follow-ups</span>
        <span class="secbadge" style="background:${openF?'rgba(212,113,106,.14)':'rgba(29,158,117,.1)'};color:${openF?'#993C1D':'#1D9E75'}">${openF?openF+' open':'all closed'}</span>
      </div>
      ${follow.length?follow.map(itemHTML).join(''):'<div class="empty">No follow-ups captured.</div>'}
      <div class="secadd"><i class="ti ti-plus" style="font-size:12px"></i>Capture follow-up</div>
    </div>`;
  }

  mount.innerHTML=`<div class="mtg-wrap"><div class="mtg-list">${listHTML}</div><div class="mtg-body">${bodyHTML}</div></div>`;
  mount.querySelectorAll('[data-mtg]').forEach(n=>n.addEventListener('click',()=>onSelectMeeting(n.dataset.mtg)));
  mount.querySelectorAll('.item[data-task]').forEach(n=>n.addEventListener('click',()=>onSelectTask(n.dataset.task)));
}
