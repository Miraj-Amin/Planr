// gridView.js — spreadsheet grid for the Plan tab.
// Every editable cell is a live <select> or <input> — no activate/deactivate.
// Features: inline editing, drag-and-drop rows (moves whole subtree),
// collapsible parents, right-click context menu, indent/outdent.

import { fmt } from '../lib/dates.js';

// ─── columns ─────────────────────────────────────────────────────────────────
const ALL_COLS = [
  { id:'name',       label:'Task',    w:340 },
  { id:'status',     label:'Status',  w:130 },
  { id:'owner_id',   label:'Owner',   w:150 },
  { id:'type',       label:'Type',    w:120 },
  { id:'start_date', label:'Start',   w:130 },
  { id:'end_date',   label:'Due',     w:130 },
  { id:'effort_min', label:'Effort',  w:100 },
  { id:'sprint_id',  label:'Sprint',  w:140 },
  { id:'progress',   label:'%',       w:80  },
];

const STATUSES = [['todo','To do'],['in-progress','In progress'],['blocked','Blocked'],['review','Review'],['done','Done']];
const TYPES    = [['task','Task'],['deliverable','Deliverable'],['milestone','Milestone'],['phase','Phase'],['agenda','Agenda'],['followup','Follow-up']];
const EFFORT   = [[0,'—'],[15,'15m'],[30,'30m'],[60,'1h'],[120,'2h'],[240,'4h'],[480,'1d'],[960,'2d'],[2400,'1w']];

let _sortSeq = 1_000_000;
const nextSort = () => ++_sortSeq;

// ─── cell HTML ───────────────────────────────────────────────────────────────
function cellHTML(colId, task, ctx, hasChildren, isCollapsed) {
  const { people, sprints } = ctx;
  const baseStyle = 'border:0;outline:0;background:transparent;font-family:inherit;font-size:13px;color:#1A1A22;width:100%;height:100%;padding:0;cursor:pointer';

  switch (colId) {
    case 'name': {
      const bold = task.type==='phase'      ? 'font-weight:600;color:#3C3489' :
                   task.type==='deliverable'? 'font-weight:500;color:#0F6E56' :
                   task.type==='milestone'  ? 'font-weight:500;color:#854F0B' : '';
      const chevron = hasChildren
        ? `<span class="g-chev" data-id="${task.id}" style="cursor:pointer;color:#9CA3AF;
             font-size:10px;margin-right:2px;user-select:none;width:12px;flex-shrink:0;
             display:inline-flex;align-items:center;justify-content:center">
             ${isCollapsed ? '▶' : '▼'}
           </span>`
        : `<span style="width:12px;flex-shrink:0"></span>`;
      const dragHandle = `<span class="g-drag" data-id="${task.id}" draggable="true"
        style="opacity:0;cursor:grab;color:#C4C9D4;font-size:14px;margin-right:4px;user-select:none;
               width:14px;flex-shrink:0;transition:opacity 100ms;line-height:1">⋮⋮</span>`;
      return `${chevron}${dragHandle}<input type="text" class="g-in" data-id="${task.id}" data-col="name"
        value="${(task.name||'').replace(/"/g,'&quot;')}" placeholder="Untitled task"
        style="${baseStyle};${bold};cursor:text">`;
    }
    case 'status': {
      const opts = STATUSES.map(([v,l]) => `<option value="${v}" ${v===task.status?'selected':''}>${l}</option>`).join('');
      return `<select class="g-in" data-id="${task.id}" data-col="status" style="${baseStyle}">${opts}</select>`;
    }
    case 'owner_id': {
      const blank = `<option value="" ${!task.owner_id?'selected':''}>Unassigned</option>`;
      const opts = people.map(p => `<option value="${p.id}" ${p.id===task.owner_id?'selected':''}>${p.name}${p.is_client?' (client)':''}</option>`).join('');
      return `<select class="g-in" data-id="${task.id}" data-col="owner_id" style="${baseStyle}">${blank}${opts}</select>`;
    }
    case 'type': {
      const opts = TYPES.map(([v,l]) => `<option value="${v}" ${v===task.type?'selected':''}>${l}</option>`).join('');
      return `<select class="g-in" data-id="${task.id}" data-col="type" style="${baseStyle}">${opts}</select>`;
    }
    case 'start_date':
      return `<input type="date" class="g-in" data-id="${task.id}" data-col="start_date"
        value="${task.start_date||''}" style="${baseStyle};font-family:monospace;font-size:12px">`;
    case 'end_date':
      return `<input type="date" class="g-in" data-id="${task.id}" data-col="end_date"
        value="${task.end_date||''}" style="${baseStyle};font-family:monospace;font-size:12px">`;
    case 'effort_min': {
      const opts = EFFORT.map(([v,l]) => `<option value="${v}" ${v===task.effort_min?'selected':''}>${l}</option>`).join('');
      return `<select class="g-in" data-id="${task.id}" data-col="effort_min" style="${baseStyle}">${opts}</select>`;
    }
    case 'sprint_id': {
      const blank = `<option value="" ${!task.sprint_id?'selected':''}>Backlog</option>`;
      const opts = sprints.map(s => `<option value="${s.id}" ${s.id===task.sprint_id?'selected':''}>${s.name}</option>`).join('');
      return `<select class="g-in" data-id="${task.id}" data-col="sprint_id" style="${baseStyle}">${blank}${opts}</select>`;
    }
    case 'progress':
      return `<input type="number" class="g-in" data-id="${task.id}" data-col="progress"
        min="0" max="100" value="${task.progress||0}" style="${baseStyle};text-align:right;font-family:monospace;font-size:12px">`;
  }
  return '';
}

// ─── row HTML ────────────────────────────────────────────────────────────────
function rowHTML(task, indent, cols, widths, ctx, hasChildren, isCollapsed) {
  const bg    = task.type==='phase'       ? 'rgba(83,74,183,.04)'  :
                task.type==='deliverable' ? 'rgba(29,158,117,.03)' :
                task.type==='milestone'   ? 'rgba(186,117,23,.03)' : '#fff';
  const strip = task.type==='phase'       ? '#534AB7' :
                task.type==='deliverable' ? '#1D9E75' :
                task.type==='milestone'   ? '#BA7517' : 'transparent';

  const cells = cols.map(colId => {
    const w   = widths[colId];
    const ipl = colId === 'name' ? 14 + indent*20 : 8;
    const stripEl = colId==='name'
      ? `<span style="position:absolute;left:0;top:0;bottom:0;width:3px;background:${strip}"></span>` : '';
    return `<td class="g-cell" data-id="${task.id}" data-col="${colId}"
      style="position:relative;height:38px;padding:0;border-bottom:1px solid rgba(0,0,0,.06);
             border-right:1px solid rgba(0,0,0,.04);width:${w}px;min-width:${w}px;max-width:${w}px;overflow:hidden;background:${bg}">
      ${stripEl}
      <div class="g-inner" style="display:flex;align-items:center;padding:0 8px 0 ${ipl}px;height:100%;overflow:hidden;gap:2px">
        ${cellHTML(colId, task, ctx, hasChildren, isCollapsed)}
      </div>
    </td>`;
  }).join('');
  return `<tr class="g-row" data-id="${task.id}">${cells}<td style="border-bottom:1px solid rgba(0,0,0,.06)"></td></tr>`;
}

function groupHeaderHTML(label, count, colspan, color='#1D9E75') {
  return `<tr class="g-group-hd"><td colspan="${colspan}" style="padding:0">
    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px 8px;background:rgba(0,0,0,.02);border-bottom:1px solid rgba(0,0,0,.06)">
      <span style="font-size:11px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:.05em">${label}</span>
      <span style="font-size:10px;color:#9CA3AF;background:rgba(0,0,0,.06);padding:1px 7px;border-radius:10px">${count}</span>
    </div>
  </td></tr>`;
}

function addRowHTML(groupKey, colspan) {
  return `<tr class="g-add-row" data-group="${groupKey}" style="cursor:pointer">
    <td colspan="${colspan}" style="padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.04)">
      <span style="font-size:12px;color:#9CA3AF;display:flex;align-items:center;gap:5px;user-select:none">
        <i class="ti ti-plus" style="font-size:11px"></i>Add task</span>
    </td>
  </tr>`;
}

// ─── date rollup ─────────────────────────────────────────────────────────────
function rollupParentDates(parentId, db, allTasks) {
  if (!parentId) return;
  const parent = db.get('tasks', parentId);
  if (!parent) return;
  const children = allTasks.filter(t => t.parent_id === parentId);
  if (!children.length) return;
  const starts = children.map(c=>c.start_date).filter(Boolean).sort();
  const ends   = children.map(c=>c.end_date).filter(Boolean).sort();
  if (starts.length || ends.length) {
    db.update('tasks', parentId, {
      start_date: starts[0] || parent.start_date,
      end_date:   ends[ends.length-1] || parent.end_date,
    });
  }
  rollupParentDates(parent.parent_id, db, allTasks);
}

// ─── indent / outdent ────────────────────────────────────────────────────────
function indentTask(taskId, db, allTasks, onRerender) {
  const task = db.get('tasks', taskId);
  if (!task) return;
  const sorted = [...allTasks].sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
  const idx = sorted.findIndex(t => t.id === taskId);
  const above = idx > 0 ? sorted[idx-1] : null;
  if (above && above.id !== task.parent_id) {
    db.update('tasks', taskId, { parent_id: above.id });
    rollupParentDates(above.id, db, allTasks);
    onRerender();
  }
}
function outdentTask(taskId, db, allTasks, onRerender) {
  const task = db.get('tasks', taskId);
  if (!task || !task.parent_id) return;
  const oldParent = db.get('tasks', task.parent_id);
  db.update('tasks', taskId, { parent_id: oldParent?.parent_id || null });
  rollupParentDates(task.parent_id, db, allTasks);
  onRerender();
}

// ─── descendants helper ──────────────────────────────────────────────────────
function getDescendantIds(taskId, allTasks) {
  const ids = new Set();
  const stack = [taskId];
  while (stack.length) {
    const id = stack.pop();
    for (const t of allTasks) {
      if (t.parent_id === id && !ids.has(t.id)) {
        ids.add(t.id);
        stack.push(t.id);
      }
    }
  }
  return ids;
}

// ─── move task (drag & drop) ─────────────────────────────────────────────────
// Move `taskId` (and its whole subtree) to sit ABOVE `targetId`, at same
// depth as targetId. If targetId has a parent, this task adopts that parent.
// Does not move a task inside its own descendants.
function moveTaskAbove(taskId, targetId, db, allTasks, onRerender) {
  if (taskId === targetId) return;
  const desc = getDescendantIds(taskId, allTasks);
  if (desc.has(targetId)) return; // can't move into own subtree
  const task   = db.get('tasks', taskId);
  const target = db.get('tasks', targetId);
  if (!task || !target) return;

  const newParent = target.parent_id || null;
  const oldParent = task.parent_id;

  // Give this task a sort_order just below target's, above target
  const targetSort = target.sort_order || 0;
  // find target's neighbor above at same level
  const siblings = allTasks
    .filter(t => (t.parent_id||null) === (newParent||null))
    .sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
  const targetIdx = siblings.findIndex(s => s.id === targetId);
  const above = targetIdx > 0 ? siblings[targetIdx-1] : null;
  const newSort = above
    ? Math.floor(((above.sort_order||0) + targetSort) / 2)
    : targetSort - 100;

  // If newSort would be <= 0, we need to shift up other tasks
  // Simpler: use a positive fractional-like approach with big spacing
  let finalSort = newSort;
  if (finalSort <= 0) {
    // Shift all siblings up by 1000, then place at (targetSort - 500)
    siblings.forEach(sib => {
      if (sib.id !== taskId) {
        db.update('tasks', sib.id, { sort_order: (sib.sort_order || 0) + 1000 });
      }
    });
    finalSort = (target.sort_order || 0) - 500 + 1000; // target got shifted too
    // But wait - we already read siblings before shift; recompute for accuracy
    // Actually easier: just use (target's new sort - 500)
    const targetNow = db.get('tasks', targetId);
    finalSort = (targetNow.sort_order || 0) - 500;
  }
  const patch = { parent_id: newParent, sort_order: finalSort };
  db.update('tasks', taskId, patch);

  // Rollup old & new parents
  if (oldParent) rollupParentDates(oldParent, db, db.all('tasks').filter(t => t.project_id === task.project_id));
  if (newParent) rollupParentDates(newParent, db, db.all('tasks').filter(t => t.project_id === task.project_id));
  onRerender();
}

// Same but places task INSIDE targetId (as last child)
function moveTaskInside(taskId, targetId, db, allTasks, onRerender) {
  if (taskId === targetId) return;
  const desc = getDescendantIds(taskId, allTasks);
  if (desc.has(targetId)) return;
  const task = db.get('tasks', taskId);
  if (!task) return;

  const oldParent = task.parent_id;
  const patch = { parent_id: targetId, sort_order: nextSort() };
  db.update('tasks', taskId, patch);

  if (oldParent) rollupParentDates(oldParent, db, db.all('tasks').filter(t => t.project_id === task.project_id));
  rollupParentDates(targetId, db, db.all('tasks').filter(t => t.project_id === task.project_id));
  onRerender();
}

// ─── state that persists across rerenders ───────────────────────────────────
let G = {
  cols:      ALL_COLS.map(c => c.id),
  widths:    Object.fromEntries(ALL_COLS.map(c => [c.id, c.w])),
  collapsed: new Set(),   // task ids whose children are hidden
};

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export function renderGrid({ mount, tasks, people, deliverables, sprints, db, projectId, onSelect, onRerender }) {

  _sortSeq = Math.max(_sortSeq, ...tasks.map(t => t.sort_order || 0));

  // Precompute which tasks have children (for chevron rendering)
  const childrenOf = new Map();
  tasks.forEach(t => {
    if (t.parent_id) {
      if (!childrenOf.has(t.parent_id)) childrenOf.set(t.parent_id, []);
      childrenOf.get(t.parent_id).push(t);
    }
  });

  // Build visible hierarchy respecting collapsed state
  function collectRows(taskId, indent) {
    const t = tasks.find(x => x.id === taskId);
    if (!t) return [];
    const hasKids = childrenOf.has(taskId);
    const isCollapsed = G.collapsed.has(taskId);
    const rows = [{ task: t, indent, hasChildren: hasKids, isCollapsed }];
    if (!isCollapsed && hasKids) {
      const kids = [...childrenOf.get(taskId)].sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
      for (const c of kids) rows.push(...collectRows(c.id, indent + 1));
    }
    return rows;
  }

  // Group by deliverable
  const groups = new Map();
  [...deliverables].sort((a,b) => (a.sort_order||0)-(b.sort_order||0))
    .forEach(d => groups.set(d.id, { label: d.name, rows: [] }));
  groups.set('__none', { label: 'No deliverable', rows: [] });
  tasks.filter(t => !t.parent_id)
    .sort((a,b) => (a.sort_order||0)-(b.sort_order||0))
    .forEach(t => {
      const key = (t.deliverable_id && groups.has(t.deliverable_id)) ? t.deliverable_id : '__none';
      groups.get(key).rows.push(...collectRows(t.id, 0));
    });

  const cols = G.cols;
  const colspan = cols.length + 1;
  const ctx = { people, sprints };

  const ths = cols.map(colId => {
    const col = ALL_COLS.find(c => c.id === colId) || { label: colId };
    return `<th data-col="${colId}"
      style="position:sticky;top:0;z-index:2;background:#F0F1F4;text-align:left;
             border-bottom:1px solid rgba(0,0,0,.1);border-right:1px solid rgba(0,0,0,.06);
             padding:0 10px;height:32px;font-size:10px;font-weight:600;color:#9CA3AF;
             text-transform:uppercase;letter-spacing:.05em;width:${G.widths[colId]}px;
             min-width:${G.widths[colId]}px;white-space:nowrap;user-select:none">
      ${col.label}
    </th>`;
  }).join('');

  let bodyHTML = '';
  groups.forEach((group, key) => {
    if (!group.rows.length && key !== '__none') return;
    const dl = key !== '__none' ? deliverables.find(d => d.id === key) : null;
    bodyHTML += groupHeaderHTML(group.label, group.rows.length, colspan, dl ? '#1D9E75' : '#9CA3AF');
    group.rows.forEach(({task, indent, hasChildren, isCollapsed}) => {
      bodyHTML += rowHTML(task, indent, cols, G.widths, ctx, hasChildren, isCollapsed);
    });
    bodyHTML += addRowHTML(key, colspan);
  });

  mount.innerHTML = `
    <div style="flex:1;overflow:auto;background:#fff;position:relative" id="gScroll">
      <div style="padding:8px 14px;display:flex;align-items:center;gap:12px;border-bottom:1px solid rgba(0,0,0,.06);background:#F8F9FB">
        <button class="g-tool" id="gExpandAll" style="border:0;background:transparent;font-size:11px;color:#6B7280;cursor:pointer;display:flex;align-items:center;gap:4px;padding:3px 6px;border-radius:5px">
          <i class="ti ti-chevrons-down" style="font-size:12px"></i>Expand all</button>
        <button class="g-tool" id="gCollapseAll" style="border:0;background:transparent;font-size:11px;color:#6B7280;cursor:pointer;display:flex;align-items:center;gap:4px;padding:3px 6px;border-radius:5px">
          <i class="ti ti-chevrons-up" style="font-size:12px"></i>Collapse all</button>
      </div>
      <table id="gTable" style="width:100%;border-collapse:collapse;table-layout:fixed">
        <colgroup>${cols.map(c => `<col style="width:${G.widths[c]}px">`).join('')}<col></colgroup>
        <thead><tr>${ths}<th style="background:#F0F1F4;border-bottom:1px solid rgba(0,0,0,.1)"></th></tr></thead>
        <tbody>${bodyHTML}</tbody>
      </table>
      <div id="gCtx" style="display:none;position:absolute;background:#fff;border:.5px solid rgba(0,0,0,.12);border-radius:9px;box-shadow:0 4px 20px rgba(0,0,0,.14);z-index:200;min-width:220px;padding:4px 0"></div>
    </div>`;

  const table  = mount.querySelector('#gTable');
  const scroll = mount.querySelector('#gScroll');
  const ctxEl  = mount.querySelector('#gCtx');

  // ─── expand/collapse all ─────────────────────────────────────────────
  mount.querySelector('#gExpandAll').addEventListener('click', () => {
    G.collapsed.clear();
    onRerender();
  });
  mount.querySelector('#gCollapseAll').addEventListener('click', () => {
    // Collapse every task that has children
    G.collapsed.clear();
    tasks.forEach(t => { if (childrenOf.has(t.id)) G.collapsed.add(t.id); });
    onRerender();
  });

  // ─── chevron toggle ────────────────────────────────────────────────────
  table.addEventListener('click', e => {
    const chev = e.target.closest('.g-chev');
    if (!chev) return;
    e.stopPropagation();
    const id = chev.dataset.id;
    if (G.collapsed.has(id)) G.collapsed.delete(id);
    else G.collapsed.add(id);
    onRerender();
  });

  // ─── change → save ─────────────────────────────────────────────────────
  table.addEventListener('change', e => {
    const el = e.target.closest('.g-in');
    if (!el) return;
    const taskId = el.dataset.id;
    const colId  = el.dataset.col;
    const task   = db.get('tasks', taskId);
    if (!task) return;

    let value;
    if (el.type === 'number')    value = el.value === '' ? null : +el.value;
    else if (el.type === 'date') value = el.value || null;
    else                         value = el.value === '' ? null : el.value;

    const patch = { [colId]: value };
    if (colId === 'progress' && value != null && value >= 100) patch.status = 'done';
    if (colId === 'progress' && value != null && value < 100 && task.status === 'done') patch.status = 'in-progress';
    db.update('tasks', taskId, patch);

    if ((colId === 'start_date' || colId === 'end_date') && task.parent_id) {
      rollupParentDates(task.parent_id, db, db.all('tasks').filter(t => t.project_id === projectId));
    }
    if (colId === 'type' || colId === 'start_date' || colId === 'end_date') {
      onRerender();
    }
  });

  // Name text input — save on blur
  table.addEventListener('blur', e => {
    const el = e.target.closest('.g-in');
    if (!el || el.dataset.col !== 'name') return;
    const task = db.get('tasks', el.dataset.id);
    if (!task) return;
    if ((task.name || '') !== el.value) db.update('tasks', el.dataset.id, { name: el.value });
  }, true);

  // Enter = new row below, Tab = indent/outdent
  table.addEventListener('keydown', e => {
    const el = e.target.closest('.g-in');
    if (!el || el.dataset.col !== 'name') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const taskId = el.dataset.id;
      const task = db.get('tasks', taskId);
      if (task) db.update('tasks', taskId, { name: el.value });
      const newTask = db.insert('tasks', {
        project_id: projectId, type: 'task', name: '', status: 'todo',
        parent_id: task?.parent_id || null,
        deliverable_id: task?.deliverable_id || null,
        sprint_id: task?.sprint_id || null,
        effort_min: 0, priority: 'normal', progress: 0, flagged: false,
        sort_order: nextSort(),
      });
      onRerender();
      requestAnimationFrame(() => {
        mount.querySelector(`.g-in[data-id="${newTask.id}"][data-col="name"]`)?.focus();
      });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const taskId = el.dataset.id;
      const task = db.get('tasks', taskId);
      if (task) db.update('tasks', taskId, { name: el.value });
      const allTasks = db.all('tasks').filter(t => t.project_id === projectId);
      if (e.shiftKey) outdentTask(taskId, db, allTasks, onRerender);
      else indentTask(taskId, db, allTasks, onRerender);
    }
  });

  // ─── hover drag handle ─────────────────────────────────────────────────
  table.addEventListener('mouseover', e => {
    const row = e.target.closest('.g-row');
    if (row) row.querySelectorAll('.g-drag').forEach(h => h.style.opacity = '1');
  });
  table.addEventListener('mouseout', e => {
    const row = e.target.closest('.g-row');
    if (row && !row.matches(':hover')) row.querySelectorAll('.g-drag').forEach(h => h.style.opacity = '0');
  });

  // ─── DRAG AND DROP ─────────────────────────────────────────────────────
  let dragId = null;
  let dropIndicator = null;

  function makeIndicator() {
    if (dropIndicator) return dropIndicator;
    dropIndicator = document.createElement('div');
    dropIndicator.style.cssText = 'position:absolute;height:3px;background:#534AB7;border-radius:2px;pointer-events:none;z-index:100;left:0;right:0;box-shadow:0 0 0 1px rgba(83,74,183,.3)';
    scroll.appendChild(dropIndicator);
    return dropIndicator;
  }
  function hideIndicator() {
    if (dropIndicator) dropIndicator.style.display = 'none';
  }

  table.addEventListener('dragstart', e => {
    const handle = e.target.closest('.g-drag');
    if (!handle) { e.preventDefault(); return; }
    const row = handle.closest('.g-row');
    if (!row) { e.preventDefault(); return; }
    dragId = row.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    row.style.opacity = '0.4';
    row.dataset.dragging = '1';
  });

  table.addEventListener('dragend', e => {
    table.querySelectorAll('[data-dragging="1"]').forEach(r => {
      r.style.opacity = '';
      delete r.dataset.dragging;
    });
    dragId = null;
    hideIndicator();
  });

  table.addEventListener('dragover', e => {
    if (!dragId) return;
    const row = e.target.closest('.g-row');
    if (!row) return;
    if (row.dataset.id === dragId) return;

    // Can't drop on own descendant
    const allTasks = db.all('tasks').filter(t => t.project_id === projectId);
    const desc = getDescendantIds(dragId, allTasks);
    if (desc.has(row.dataset.id)) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Position indicator at top of hover row
    const rect  = row.getBoundingClientRect();
    const sRect = scroll.getBoundingClientRect();
    const ind   = makeIndicator();
    ind.style.display = 'block';
    ind.style.top   = `${rect.top - sRect.top + scroll.scrollTop - 1}px`;
    ind.style.left  = `${rect.left - sRect.left}px`;
    ind.style.width = `${rect.width}px`;
  });

  table.addEventListener('drop', e => {
    if (!dragId) return;
    const row = e.target.closest('.g-row');
    if (!row) return;
    e.preventDefault();
    const targetId = row.dataset.id;
    if (targetId === dragId) { hideIndicator(); return; }
    const allTasks = db.all('tasks').filter(t => t.project_id === projectId);
    moveTaskAbove(dragId, targetId, db, allTasks, onRerender);
    hideIndicator();
    dragId = null;
  });

  // ─── + Add task row ────────────────────────────────────────────────────
  table.addEventListener('click', e => {
    const addRow = e.target.closest('.g-add-row');
    if (!addRow) return;
    const groupKey = addRow.dataset.group;
    const dl = groupKey !== '__none' ? deliverables.find(d => d.id === groupKey) : null;
    const newTask = db.insert('tasks', {
      project_id: projectId, type: 'task', name: '', status: 'todo',
      deliverable_id: dl?.id || null, progress: 0, effort_min: 0,
      priority: 'normal', flagged: false, sort_order: nextSort(),
    });
    onRerender();
    requestAnimationFrame(() => {
      mount.querySelector(`.g-in[data-id="${newTask.id}"][data-col="name"]`)?.focus();
    });
  });

  // ─── right-click context menu ──────────────────────────────────────────
  function hideCtx() { ctxEl.style.display = 'none'; }

  table.addEventListener('contextmenu', e => {
    const row = e.target.closest('.g-row');
    if (!row) return;
    e.preventDefault();
    const taskId = row.dataset.id;
    const task = db.get('tasks', taskId);
    if (!task) return;
    const allTasks = db.all('tasks').filter(t => t.project_id === projectId);
    const sorted = [...allTasks].sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
    const idx = sorted.findIndex(t => t.id === taskId);
    const above = idx > 0 ? sorted[idx-1] : null;
    const hasKids = childrenOf.has(taskId);

    const items = [
      {label:`<i class="ti ti-subtask"></i> Mark as <b>task</b>`,        dim:task.type==='task',        action:()=>{db.update('tasks',taskId,{type:'task'});onRerender();hideCtx();}},
      {label:`<i class="ti ti-package"></i> Mark as <b>deliverable</b>`, dim:task.type==='deliverable', action:()=>{db.update('tasks',taskId,{type:'deliverable'});onRerender();hideCtx();}},
      {label:`<i class="ti ti-diamond"></i> Mark as <b>milestone</b>`,   dim:task.type==='milestone',   action:()=>{db.update('tasks',taskId,{type:'milestone'});onRerender();hideCtx();}},
      null,
      hasKids ? {label:`<i class="ti ti-fold"></i> ${G.collapsed.has(taskId) ? 'Expand' : 'Collapse'} children`, action:()=>{if(G.collapsed.has(taskId))G.collapsed.delete(taskId);else G.collapsed.add(taskId);onRerender();hideCtx();}} : null,
      hasKids ? null : undefined,
      {label:`<i class="ti ti-plus"></i> Insert row above`, action:()=>{
        const t = db.insert('tasks',{project_id:projectId,type:'task',name:'',status:'todo',parent_id:task.parent_id||null,deliverable_id:task.deliverable_id||null,effort_min:0,priority:'normal',progress:0,flagged:false,sort_order:(task.sort_order||nextSort())-1});
        onRerender(); hideCtx();
        requestAnimationFrame(() => mount.querySelector(`.g-in[data-id="${t.id}"][data-col="name"]`)?.focus());
      }},
      {label:`<i class="ti ti-plus"></i> Insert row below`, action:()=>{
        const t = db.insert('tasks',{project_id:projectId,type:'task',name:'',status:'todo',parent_id:task.parent_id||null,deliverable_id:task.deliverable_id||null,effort_min:0,priority:'normal',progress:0,flagged:false,sort_order:nextSort()});
        onRerender(); hideCtx();
        requestAnimationFrame(() => mount.querySelector(`.g-in[data-id="${t.id}"][data-col="name"]`)?.focus());
      }},
      null,
      {label:`<i class="ti ti-arrow-right"></i> Indent`, disabled:!above, action:()=>{indentTask(taskId,db,allTasks,onRerender);hideCtx();}},
      {label:`<i class="ti ti-arrow-left"></i> Outdent`, disabled:!task.parent_id, action:()=>{outdentTask(taskId,db,allTasks,onRerender);hideCtx();}},
      null,
      {label:`<i class="ti ti-message-circle"></i> ${task.flagged?'Remove from agenda':'Flag for meeting'}`, action:()=>{db.update('tasks',taskId,{flagged:!task.flagged});onRerender();hideCtx();}},
      null,
      {label:`<i class="ti ti-trash" style="color:#E24B4A"></i> <span style="color:#E24B4A">Delete task</span>`, action:()=>{if(confirm(`Delete "${task.name||'this task'}"?`)){db.remove('tasks',taskId);onRerender();}hideCtx();}},
    ].filter(x => x !== undefined);

    const rect = scroll.getBoundingClientRect();
    ctxEl.innerHTML = items.map(item => item === null
      ? '<div style="height:1px;background:rgba(0,0,0,.07);margin:3px 0"></div>'
      : `<div class="ctx-item" style="padding:8px 14px;font-size:12.5px;cursor:${item.disabled?'default':'pointer'};display:flex;align-items:center;gap:8px;color:${item.disabled?'#C4C9D4':item.dim?'#534AB7':'#1A1A22'};${item.dim?'background:rgba(83,74,183,.06)':''}">${item.label}</div>`
    ).join('');
    ctxEl.style.display = 'block';
    ctxEl.style.left = `${e.clientX - rect.left + scroll.scrollLeft}px`;
    ctxEl.style.top  = `${e.clientY - rect.top + scroll.scrollTop}px`;

    let ri = 0;
    ctxEl.querySelectorAll('.ctx-item').forEach(el => {
      while (items[ri] === null) ri++;
      const item = items[ri++];
      if (!item.disabled) {
        el.addEventListener('click', item.action);
        el.addEventListener('mouseover', () => { if(!item.dim) el.style.background='rgba(83,74,183,.06)'; });
        el.addEventListener('mouseout',  () => { if(!item.dim) el.style.background=''; });
      }
    });
  });

  document.addEventListener('mousedown', e => { if (!e.target.closest('#gCtx')) hideCtx(); });
}
