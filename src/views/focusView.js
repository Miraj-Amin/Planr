// focusView.js — Focus view: overdue+today, this week, next week, later.
// - Shows only LEAF tasks (no children) — since parents are rollup rows in Plan.
// - Groups by the task's own start_date/end_date (child's date, not parent's).
// - Order within groups is user-managed via focus_order (nullable). Reordering
//   here does NOT change sort_order on the Plan grid.
// - Parent breadcrumb shown for context.

import { fmt, stripTime } from '../lib/dates.js';

const pd = s => s ? new Date(s + 'T00:00:00') : null;
const daysBetween = (a, b) => Math.round((stripTime(a) - stripTime(b)) / 86400000);

const EFFORT = [
  { v:15,l:'15m' },{ v:30,l:'30m' },{ v:60,l:'1h' },
  { v:120,l:'2h' },{ v:240,l:'4h' },{ v:480,l:'1d' },
];
const effLabel = m => {
  if (!m) return '';
  const e = EFFORT.find(x => x.v === m);
  if (e) return e.l;
  return m >= 480 ? (m/480) + 'd' : m >= 60 ? (m/60) + 'h' : m + 'm';
};
const STATUSES = { todo:'#A0A7B4','in-progress':'#7F77DD',blocked:'#E24B4A',review:'#BA7517',done:'#1D9E75' };
const STATUS_L = { todo:'To do','in-progress':'In progress',blocked:'Blocked',review:'Review',done:'Done' };
const TYPES = { phase:'#7F77DD',task:'#6B7280',milestone:'#BA7517',deliverable:'#1D9E75',agenda:'#378ADD',followup:'#D4716A',meeting:'#534AB7' };
const TYPE_I = { phase:'ti-layers-intersect',task:'ti-square',milestone:'ti-diamond',deliverable:'ti-package',agenda:'ti-message-circle',followup:'ti-arrow-forward',meeting:'ti-calendar-event' };

// Which date determines the group? Prefer end_date (due), fall back to start_date.
const groupingDate = t => t.end_date || t.start_date || null;

function classify(t, today) {
  const d = pd(groupingDate(t));
  if (!d) return 'later';  // No date → goes into Later so user can still reorder them
  const delta = daysBetween(d, today);
  if (delta < 0 && t.status !== 'done') return 'overdue';
  if (delta <= 0) return 'today';          // due today
  // Week boundary: end of this week (Sunday-based; use ISO Mon-Sun so week goes Mon→Sun)
  const dow = today.getDay();               // 0=Sun...6=Sat
  const daysUntilEndOfWeek = dow === 0 ? 0 : (7 - dow);  // days until Sunday
  if (delta <= daysUntilEndOfWeek) return 'this-week';
  if (delta <= daysUntilEndOfWeek + 7) return 'next-week';
  return 'later';
}

const GROUPS = [
  { id: 'overdue-today', label: 'Overdue & today', ids: ['overdue','today'], accent: '#E24B4A' },
  { id: 'this-week',     label: 'This week',        ids: ['this-week'],     accent: '#BA7517' },
  { id: 'next-week',     label: 'Next week',        ids: ['next-week'],     accent: '#7F77DD' },
  { id: 'later',         label: 'Later',            ids: ['later'],         accent: '#6B7280' },
];

function rowHTML(t, people, projects, taskById, isFirst, isLast) {
  const o = people.find(p => p.id === t.owner_id);
  const proj = projects.find(p => p.id === t.project_id);
  const parent = t.parent_id ? taskById.get(t.parent_id) : null;
  const stColor = STATUSES[t.status] || '#A0A7B4';
  const overdue = pd(groupingDate(t)) && pd(groupingDate(t)) < new Date() && t.status !== 'done';
  const dueCol = overdue ? '#E24B4A' : '#6B7280';

  // Build breadcrumb up to root parent (for context in the focus row)
  const crumbs = [];
  let cur = parent;
  while (cur) {
    crumbs.unshift(cur.name);
    cur = cur.parent_id ? taskById.get(cur.parent_id) : null;
  }
  const crumbHTML = crumbs.length
    ? `<div class="foc-crumb">${crumbs.join(' › ')}</div>`
    : '';

  return `<div class="foc-row" data-task="${t.id}">
    <div class="foc-order">
      <button class="foc-up"   data-task="${t.id}" ${isFirst?'disabled':''} title="Move up">
        <i class="ti ti-chevron-up"></i>
      </button>
      <button class="foc-down" data-task="${t.id}" ${isLast?'disabled':''} title="Move down">
        <i class="ti ti-chevron-down"></i>
      </button>
    </div>
    <div class="foc-body">
      ${crumbHTML}
      <div class="foc-title-line">
        <div class="tico" style="background:${(TYPES[t.type]||'#888')}1a"><i class="ti ${TYPE_I[t.type]||'ti-square'}" style="color:${TYPES[t.type]||'#888'}"></i></div>
        <div class="foc-name">${t.name}</div>
        ${proj ? `<span class="foc-proj">${proj.name}</span>` : ''}
      </div>
      <div class="foc-meta">
        <span class="stat" style="background:${stColor}1a;color:${stColor}">${STATUS_L[t.status] || t.status}</span>
        ${o ? `<div class="av" style="background:${o.color};width:20px;height:20px;font-size:8px">${o.initials}</div><span style="font-size:11px;color:#6B7280">${o.name}</span>` : ''}
        ${t.effort_min ? `<span style="font-size:11px;color:#9CA3AF;font-family:monospace">${effLabel(t.effort_min)}</span>` : ''}
        <span style="font-size:11px;color:${dueCol};font-family:monospace;margin-left:auto">
          ${groupingDate(t) ? fmt(groupingDate(t)) : 'No date'}
        </span>
      </div>
    </div>
  </div>`;
}

export function renderFocus({ mount, tasks, people, projects, db, onSelect, onRerender, global = false }) {
  const today = new Date();
  const taskById = new Map(tasks.map(t => [t.id, t]));

  // When in global mode, only include tasks from active projects
  const workingTasks = global
    ? tasks.filter(t => {
        const proj = projects.find(p => p.id === t.project_id);
        return proj && proj.status === 'active';
      })
    : tasks;

  // Build set of parents (tasks that have children) so we can filter to leaves only
  const parentIds = new Set();
  workingTasks.forEach(t => { if (t.parent_id) parentIds.add(t.parent_id); });

  // Filter: leaves only, exclude done, exclude phases and meeting/agenda/followup shells
  const candidates = workingTasks.filter(t =>
    !parentIds.has(t.id) &&           // no children = leaf
    t.status !== 'done' &&
    t.type !== 'phase' &&
    t.type !== 'meeting'              // meeting shells aren't work
  );

  // Classify
  const buckets = { 'overdue-today': [], 'this-week': [], 'next-week': [], 'later': [] };
  candidates.forEach(t => {
    const c = classify(t, today);
    const groupId = (c === 'overdue' || c === 'today') ? 'overdue-today' : c;
    buckets[groupId].push(t);
  });

  // Sort each bucket: user's focus_order first (ascending), then by grouping date, then by name
  Object.values(buckets).forEach(list => {
    list.sort((a, b) => {
      const ao = a.focus_order, bo = b.focus_order;
      if (ao != null && bo != null) return ao - bo;
      if (ao != null) return -1;
      if (bo != null) return 1;
      const ad = groupingDate(a), bd = groupingDate(b);
      if (ad && bd) return ad.localeCompare(bd);
      if (ad) return -1;
      if (bd) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  });

  const total = Object.values(buckets).reduce((n, l) => n + l.length, 0);

  const groupHTML = ({ id, label, accent }) => {
    const items = buckets[id];
    if (!items.length) return '';

    let bodyHTML = '';

    if (global) {
      // Sub-group by project inside each time bucket
      const byProject = new Map();
      items.forEach(t => {
        if (!byProject.has(t.project_id)) byProject.set(t.project_id, []);
        byProject.get(t.project_id).push(t);
      });

      // Order projects alphabetically by name
      const orderedProjects = [...byProject.keys()]
        .map(pid => projects.find(p => p.id === pid))
        .filter(Boolean)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      bodyHTML = orderedProjects.map(proj => {
        const list = byProject.get(proj.id);
        const rows = list.map((t, i) =>
          rowHTML(t, people, projects, taskById, i === 0, i === list.length - 1)
        ).join('');
        return `<div class="foc-proj-group">
          <div class="foc-proj-head">
            <i class="ti ti-folder" style="font-size:12px;color:#9CA3AF"></i>
            <span class="foc-proj-name">${proj.name}</span>
            <span class="foc-proj-count">${list.length}</span>
          </div>
          <div class="foc-group-rows" data-group="${id}" data-project="${proj.id}">${rows}</div>
        </div>`;
      }).join('');
    } else {
      const rows = items.map((t, i) =>
        rowHTML(t, people, projects, taskById, i === 0, i === items.length - 1)
      ).join('');
      bodyHTML = `<div class="foc-group-rows" data-group="${id}">${rows}</div>`;
    }

    return `<div class="foc-group">
      <div class="foc-group-head">
        <span class="foc-group-dot" style="background:${accent}"></span>
        <span class="foc-group-name">${label}</span>
        <span class="foc-group-count">${items.length}</span>
      </div>
      ${bodyHTML}
    </div>`;
  };

  mount.innerHTML = `
    <div class="foc-banner">
      <i class="ti ti-target" style="color:#7F77DD;font-size:14px"></i>
      <span><b>${total} item${total === 1 ? '' : 's'}</b> in focus${global ? ' across all active projects' : ''}.</span>
      <span style="margin-left:auto;color:#9CA3AF">Ordering here doesn't change your Plan.</span>
    </div>
    <div class="foc-scroll">
      ${GROUPS.map(groupHTML).join('')}
      ${total === 0 ? '<div style="padding:60px;text-align:center;color:#9CA3AF;font-size:13px">Nothing to focus on right now.</div>' : ''}
    </div>
  `;

  // ── Reorder within a group ──────────────────────────────────────────
  function move(taskId, direction) {
    // Find which bucket the task is in
    for (const [groupId, list] of Object.entries(buckets)) {
      const idx = list.findIndex(t => t.id === taskId);
      if (idx === -1) continue;

      // In global mode, reordering only happens WITHIN a project's sub-group.
      // Find the project's sublist and reorder inside it.
      let scopedList;
      if (global) {
        const task = list[idx];
        scopedList = list.filter(t => t.project_id === task.project_id);
      } else {
        scopedList = list;
      }

      const scopedIdx = scopedList.findIndex(t => t.id === taskId);
      const newIdx = direction === 'up' ? scopedIdx - 1 : scopedIdx + 1;
      if (newIdx < 0 || newIdx >= scopedList.length) return;

      // Swap them
      const [a, b] = [scopedList[scopedIdx], scopedList[newIdx]];
      const reordered = [...scopedList];
      reordered[scopedIdx] = b;
      reordered[newIdx] = a;

      // Renumber focus_order for the scoped list from 0 so gaps close cleanly
      reordered.forEach((t, i) => {
        db.update('tasks', t.id, { focus_order: i });
      });

      onRerender?.();
      return;
    }
  }

  mount.querySelectorAll('.foc-up').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      move(btn.dataset.task, 'up');
    });
  });
  mount.querySelectorAll('.foc-down').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      move(btn.dataset.task, 'down');
    });
  });

  // ── Click row → select task ─────────────────────────────────────────
  mount.querySelectorAll('.foc-row').forEach(r => {
    r.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      onSelect(r.dataset.task);
    });
  });
}
