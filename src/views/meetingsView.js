// meetingsView.js — Meeting log with agenda/follow-up separation.
// - Add agenda / follow-up items via inline forms
// - Open-item backlog: unresolved items from any meeting, addable to current
// - Toggle agenda ↔ follow-up
// - Assign owner + due date to follow-ups inline
// - Auto-carry unresolved items into newly created meetings

import { fmt, fmtLong } from '../lib/dates.js';

const TODAY = new Date();
const pd = s => s ? new Date(s + 'T00:00:00') : null;
const isOverdue = t => { const d = pd(t.end_date); return !!d && d < TODAY && t.status !== 'done'; };
const isClient = (t, people) => { const o = people.find(p => p.id === t.owner_id); return !!(o && o.is_client); };

function endTime(meeting) {
  const [h, m] = meeting.start_time.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m + meeting.duration_min);
  return d.toTimeString().slice(0, 5);
}

export function renderMeetings({
  mount, meetings, meeting_items, meeting_item_links, tasks, people, activeMeeting,
  db, projectId,
  onSelectMeeting, onSelectTask, onAddAgenda, onAddFollowup, onRerender,
}) {
  const byId = new Map(tasks.map(t => [t.id, t]));

  function itemsForMeeting(mid) {
    const linkIds = new Set(meeting_item_links.filter(l => l.meeting_id === mid).map(l => l.meeting_item_id));
    return meeting_items
      .filter(mi => linkIds.has(mi.id))
      .map(mi => ({ ...mi, task: byId.get(mi.task_id) }))
      .filter(x => x.task);
  }

  // All unresolved items across the whole project (agenda or follow-up not yet done)
  function allOpenItems() {
    return meeting_items
      .map(mi => ({ ...mi, task: byId.get(mi.task_id) }))
      .filter(x => x.task && x.task.project_id === projectId)
      .filter(x => !x.resolved && x.task.status !== 'done');
  }

  function openCount(mid) {
    return itemsForMeeting(mid).filter(x => !x.resolved && x.task.status !== 'done').length;
  }

  const sortedMeetings = [...meetings].sort((a, b) => b.date.localeCompare(a.date));
  const cur = activeMeeting ? meetings.find(m => m.id === activeMeeting) : sortedMeetings[0];

  // ── Meetings list HTML ─────────────────────────────────────────────
  const listHTML = sortedMeetings.map(m => {
    const open = openCount(m.id);
    const future = m.date > new Date().toISOString().slice(0, 10);
    return `<div class="mtg-li ${cur && m.id === cur.id ? 'on' : ''}" data-mtg="${m.id}">
      <div class="mtg-li-d"><i class="ti ti-calendar" style="font-size:11px"></i>${fmtLong(m.date)}
        ${future ? `<span class="chip" style="background:rgba(127,119,221,.08);color:#534AB7">Upcoming</span>` : ''}</div>
      <div class="mtg-li-t">${m.title}</div>
      <div class="mtg-li-m">
        <span><i class="ti ti-clock" style="font-size:11px;vertical-align:-2px"></i> ${m.duration_min}m</span>
        ${open ? `<span style="color:#BA7517">${open} open</span>` : '<span style="color:#1D9E75">All closed</span>'}
      </div>
    </div>`;
  }).join('');



  // ── Meeting body ──────────────────────────────────────────────────
  let bodyHTML = '<div class="empty" style="padding:60px;text-align:center;color:#9CA3AF">No meeting selected. Create one from the top-right.</div>';

  if (cur) {
    const items = itemsForMeeting(cur.id);
    const agenda = items.filter(x => x.kind === 'agenda');
    const follow = items.filter(x => x.kind === 'followup');
    const openA = agenda.filter(x => !(x.resolved || x.task.status === 'done')).length;
    const openF = follow.filter(x => !(x.resolved || x.task.status === 'done')).length;

    const OWNER_OPTS = (selectedId) => {
      const blank = `<option value="" ${!selectedId ? 'selected' : ''}>Unassigned</option>`;
      const opts = people.map(p =>
        `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.name}${p.is_client ? ' (client)' : ''}</option>`
      ).join('');
      return blank + opts;
    };

    const itemHTML = (x) => {
      const t = x.task;
      const o = people.find(p => p.id === t.owner_id);
      const done = x.resolved || t.status === 'done';
      const over = isOverdue(t);
      const others = meeting_item_links.filter(l => l.meeting_item_id === x.id && l.meeting_id !== cur.id).length;
      const iconClr = x.kind === 'agenda' ? '#378ADD' : '#D4716A';
      const iconTi  = x.kind === 'agenda' ? 'message-circle' : 'arrow-forward';

      return `<div class="item" data-item="${x.id}" data-task="${t.id}" data-kind="${x.kind}">
        <div class="item-check-wrap">
          <i class="ti ti-${done ? 'circle-check' : 'circle'} ck item-check" data-item="${x.id}"
             style="color:${done ? '#1D9E75' : '#9CA3AF'};cursor:pointer" title="Mark ${done ? 'not done' : 'done'}"></i>
        </div>
        <div class="item-b">
          <input class="item-name-in" data-item="${x.id}" value="${(t.name||'').replace(/"/g,'&quot;')}"
                 placeholder="Untitled" style="border:0;outline:0;background:transparent;
                 font-size:12.5px;line-height:1.4;font-family:inherit;width:100%;
                 color:${done ? '#9CA3AF' : '#1A1A22'};${done ? 'text-decoration:line-through' : ''}">
          <div class="item-m">
            <select class="item-owner" data-item="${x.id}" style="border:0;outline:0;background:transparent;font-size:10.5px;color:#6B7280;cursor:pointer;padding:1px 3px;border-radius:4px">
              ${OWNER_OPTS(t.owner_id)}
            </select>
            ${isClient(t, people) ? `<span class="chip" style="background:rgba(186,117,23,.12);color:#854F0B"><i class="ti ti-user-star"></i>Client</span>` : ''}
            <input type="date" class="item-due" data-item="${x.id}" value="${t.end_date || ''}"
                   style="border:0;outline:0;background:transparent;font-size:10.5px;color:${over ? '#E24B4A' : '#9CA3AF'};font-family:monospace;cursor:pointer;padding:1px 3px;border-radius:4px">
            ${others ? `<span><i class="ti ti-link" style="font-size:11px;vertical-align:-1px"></i>${others} other meeting${others > 1 ? 's' : ''}</span>` : ''}
            <span class="item-actions">
              <select class="item-kind" data-item="${x.id}" title="Change item type"
                      style="border:.5px solid rgba(0,0,0,.15);background:#fff;color:${x.kind==='agenda' ? '#185FA5' : '#993C1D'};font-size:10px;cursor:pointer;padding:3px 6px;border-radius:6px;font-weight:500">
                <option value="agenda"   ${x.kind==='agenda'   ? 'selected' : ''}>Agenda</option>
                <option value="followup" ${x.kind==='followup' ? 'selected' : ''}>Action / follow-up</option>
              </select>
              <button class="item-delete" data-item="${x.id}"
                      style="border:0;background:transparent;color:#C4C9D4;font-size:12px;cursor:pointer;padding:3px 6px;border-radius:4px" title="Remove from meeting">
                <i class="ti ti-x"></i> Remove
              </button>
            </span>
          </div>
        </div>
      </div>`;
    };

    bodyHTML = `
      <div class="mtg-head">
        <input class="mtg-title-in" value="${cur.title.replace(/"/g,'&quot;')}"
               style="border:0;outline:0;background:transparent;font-size:16px;font-weight:500;margin-bottom:8px;width:100%;font-family:inherit">
        <div class="mtg-facts">
          <div><i class="ti ti-calendar"></i>
            <input type="date" class="mtg-date-in" value="${cur.date}"
                   style="border:0;outline:0;background:transparent;font-size:11px;color:#6B7280;font-family:monospace">
          </div>
          <div><i class="ti ti-clock"></i>${cur.start_time}–${endTime(cur)} · ${cur.duration_min}m</div>
        </div>
      </div>

      <div class="sec">
        <div class="sech">
          <i class="ti ti-message-circle" style="font-size:14px;color:#378ADD"></i>
          <span class="secname">Agenda</span>
          <span class="secbadge" style="background:${openA ? 'rgba(55,138,221,.12)' : 'rgba(29,158,117,.1)'};color:${openA ? '#185FA5' : '#1D9E75'}">
            ${openA ? openA + ' open' : 'all covered'}
          </span>
        </div>
        ${agenda.length ? agenda.map(itemHTML).join('') : '<div class="empty" style="padding:16px;color:#9CA3AF;font-size:12px">No agenda items yet.</div>'}
        <div class="secadd" id="add-agenda-btn"><i class="ti ti-plus" style="font-size:12px"></i>Add agenda item</div>
      </div>

      <div class="sec">
        <div class="sech">
          <i class="ti ti-arrow-forward" style="font-size:14px;color:#D4716A"></i>
          <span class="secname">Actions &amp; follow-ups</span>
          <span class="secbadge" style="background:${openF ? 'rgba(212,113,106,.14)' : 'rgba(29,158,117,.1)'};color:${openF ? '#993C1D' : '#1D9E75'}">
            ${openF ? openF + ' open' : 'all closed'}
          </span>
        </div>
        ${follow.length ? follow.map(itemHTML).join('') : '<div class="empty" style="padding:16px;color:#9CA3AF;font-size:12px">No follow-ups captured.</div>'}
        <div class="secadd" id="add-followup-btn"><i class="ti ti-plus" style="font-size:12px"></i>Capture follow-up</div>
      </div>

      ${(() => {
        // Open items from OTHER meetings — not already in this one
        const inThisMeeting = new Set(items.map(i => i.id));
        const backlog = allOpenItems().filter(x => !inThisMeeting.has(x.id));
        if (!backlog.length) return '';
        return `<div class="sec">
          <div class="sech">
            <i class="ti ti-inbox" style="font-size:14px;color:#7F77DD"></i>
            <span class="secname">Open items from other meetings</span>
            <span class="secbadge" style="background:rgba(127,119,221,.12);color:#3C3489">${backlog.length}</span>
          </div>
          ${backlog.map(x => {
            // Reuse the same itemHTML so inline editing (type, owner, due, name, check) works
            // Wrap it and add an "Add to this meeting" button on the right
            // itemHTML normally includes an item-delete (unlink) button that only makes sense
            // for items IN the current meeting. Strip it for backlog rows and add the "Add" button.
            let h = itemHTML(x);
            h = h.replace(/<button class="item-delete"[\s\S]*?<\/button>/, '');
            h = h.replace(
              '<span class="item-actions">',
              `<span class="item-actions">
                <button class="backlog-add-inline" data-item="${x.id}" data-meeting="${cur.id}"
                        style="border:.5px solid #534AB7;background:transparent;color:#534AB7;font-size:10px;
                               cursor:pointer;padding:3px 9px;border-radius:6px;font-weight:500;margin-right:4px">
                  <i class="ti ti-plus" style="font-size:10px"></i> Add to this meeting
                </button>`
            );
            return h;
          }).join('')}
        </div>`;
      })()}
    `;
  }

  mount.innerHTML = `<div class="mtg-wrap">
    <div class="mtg-list">
      ${listHTML}
    </div>
    <div class="mtg-body">${bodyHTML}</div>
  </div>`;

  // ── Wire up events ────────────────────────────────────────────────
  mount.querySelectorAll('[data-mtg]').forEach(n => n.addEventListener('click', () => onSelectMeeting(n.dataset.mtg)));

  // Add agenda / follow-up
  mount.querySelector('#add-agenda-btn')?.addEventListener('click', () => onAddAgenda?.());
  mount.querySelector('#add-followup-btn')?.addEventListener('click', () => onAddFollowup?.());

  // Backlog "Add to this meeting" — links an open item from another meeting
  mount.querySelectorAll('.backlog-add-inline').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const itemId = btn.dataset.item;
      const meetingId = btn.dataset.meeting;
      const exists = meeting_item_links.some(l => l.meeting_item_id === itemId && l.meeting_id === meetingId);
      if (!exists) {
        db.insert('meeting_item_links', { meeting_item_id: itemId, meeting_id: meetingId });
        onRerender?.();
      }
    });
  });

  // Item checkbox toggle
  mount.querySelectorAll('.item-check').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const itemId = el.dataset.item;
      const item = meeting_items.find(mi => mi.id === itemId);
      if (!item) return;
      const task = byId.get(item.task_id);
      if (!task) return;
      const done = task.status === 'done';
      db.update('tasks', task.id, { status: done ? 'todo' : 'done', progress: done ? 0 : 100 });
      db.update('meeting_items', item.id, { resolved: !done });
      onRerender?.();
    });
  });

  // Item name inline edit
  mount.querySelectorAll('.item-name-in').forEach(el => {
    el.addEventListener('blur', () => {
      const item = meeting_items.find(mi => mi.id === el.dataset.item);
      if (!item) return;
      const task = byId.get(item.task_id);
      if (task && (task.name || '') !== el.value) {
        db.update('tasks', task.id, { name: el.value });
      }
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    });
  });

  // Item owner change
  mount.querySelectorAll('.item-owner').forEach(el => {
    el.addEventListener('change', () => {
      const item = meeting_items.find(mi => mi.id === el.dataset.item);
      if (!item) return;
      db.update('tasks', item.task_id, { owner_id: el.value || null });
      onRerender?.();
    });
  });

  // Item due date change
  mount.querySelectorAll('.item-due').forEach(el => {
    el.addEventListener('change', () => {
      const item = meeting_items.find(mi => mi.id === el.dataset.item);
      if (!item) return;
      db.update('tasks', item.task_id, { end_date: el.value || null });
      onRerender?.();
    });
  });

  // Change item kind (agenda ↔ follow-up) via dropdown
  mount.querySelectorAll('.item-kind').forEach(sel => {
    sel.addEventListener('change', e => {
      e.stopPropagation();
      const item = meeting_items.find(mi => mi.id === sel.dataset.item);
      if (!item) return;
      const newKind = sel.value;
      if (newKind === item.kind) return;
      db.update('meeting_items', item.id, { kind: newKind });
      // Also change the underlying task's type to match
      db.update('tasks', item.task_id, { type: newKind });
      onRerender?.();
    });
    // Prevent the item row click handler from firing on dropdown clicks
    sel.addEventListener('click', e => e.stopPropagation());
  });

  // Remove item from meeting (unlink, not delete)
  mount.querySelectorAll('.item-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!cur) return;
      const itemId = btn.dataset.item;
      const link = meeting_item_links.find(l => l.meeting_item_id === itemId && l.meeting_id === cur.id);
      if (link) db.remove('meeting_item_links', link.id);
      onRerender?.();
    });
  });

  // Meeting title / date edit
  const titleIn = mount.querySelector('.mtg-title-in');
  if (titleIn) {
    titleIn.addEventListener('blur', () => {
      if (cur && cur.title !== titleIn.value) db.update('meetings', cur.id, { title: titleIn.value });
    });
    titleIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); titleIn.blur(); } });
  }
  const dateIn = mount.querySelector('.mtg-date-in');
  if (dateIn) {
    dateIn.addEventListener('change', () => {
      if (cur && cur.date !== dateIn.value) db.update('meetings', cur.id, { date: dateIn.value });
    });
  }

  // Item body click → select the underlying task
  mount.querySelectorAll('.item[data-task]').forEach(n => {
    n.addEventListener('click', e => {
      if (e.target.closest('button, input, select, .item-check')) return;
      onSelectTask(n.dataset.task);
    });
  });
}
