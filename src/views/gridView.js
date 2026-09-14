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
const TYPES    = [['task','Task'],['deliverable','Deliverable'],['milestone','Milestone'],['phase','Phase'],['meeting','Meeting'],['action','Action'],['followup','Follow-up']];
const EFFORT   = [[0,'—'],[15,'15m'],[30,'30m'],[60,'1h'],[120,'2h'],[240,'4h'],[480,'1d'],[960,'2d'],[2400,'1w']];

let _sortSeq = 1_000_000;
const nextSort = () => ++_sortSeq;

// ─── cell HTML ───────────────────────────────────────────────────────────────
function cellHTML(colId, task, ctx, hasChildren, isCollapsed) {
  const { people, sprints } = ctx;
  const baseStyle = 'border:0;outline:0;background:transparent;font-family:inherit;font-size:13px;color:#1A1A22;width:100%;height:100%;padding:0;cursor:pointer';

  // Fields that are auto-rolled-up on parents and must be locked
  const LOCKED_ON_PARENT = ['status','start_date','end_date','effort_min','progress'];
  const isLocked = hasChildren && LOCKED_ON_PARENT.includes(colId);
  const lockStyle = isLocked
    ? 'cursor:not-allowed;color:#6B7280;pointer-events:none;opacity:0.85'
    : '';
  const lockAttr = isLocked ? 'disabled' : '';
  const lockTitle = isLocked ? 'title="Rolled up from children"' : '';

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
      const openBtn = `<button class="g-open" data-id="${task.id}" title="Open task details"
        style="opacity:0;background:transparent;border:0;padding:0;cursor:pointer;color:#9CA3AF;
               font-size:12px;margin-right:4px;user-select:none;width:16px;height:16px;
               display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;
               transition:opacity 100ms;border-radius:3px" onmouseover="this.style.background='rgba(83,74,183,.1)';this.style.color='#534AB7'" onmouseout="this.style.background='transparent';this.style.color='#9CA3AF'">
        <i class="ti ti-arrow-up-right" style="font-size:11px"></i>
      </button>`;
      // In wrap mode use a textarea that auto-grows so long names wrap onto multiple lines.
      // In non-wrap mode keep the classic single-line input for max density.
      if (ctx.wrap) {
        return `${chevron}${dragHandle}${openBtn}<textarea class="g-in g-name-ta" data-id="${task.id}" data-col="name"
          placeholder="Untitled task" rows="1"
          style="${baseStyle};${bold};cursor:text;resize:none;padding:2px 0;line-height:1.4;
                 min-height:22px;overflow:hidden;white-space:pre-wrap;word-wrap:break-word">${(task.name||'').replace(/</g,'&lt;')}</textarea>`;
      }
      return `${chevron}${dragHandle}${openBtn}<input type="text" class="g-in" data-id="${task.id}" data-col="name"
        value="${(task.name||'').replace(/"/g,'&quot;')}" placeholder="Untitled task"
        style="${baseStyle};${bold};cursor:text">`;
    }
    case 'status': {
      const opts = STATUSES.map(([v,l]) => `<option value="${v}" ${v===task.status?'selected':''}>${l}</option>`).join('');
      return `<select class="g-in" data-id="${task.id}" data-col="status" ${lockAttr} ${lockTitle} style="${baseStyle};${lockStyle}">${opts}</select>`;
    }
    case 'owner_id': {
      const blank = `<option value="" ${!task.owner_id?'selected':''}>Unassigned</option>`;
      const opts = people.map(p => `<option value="${p.id}" ${p.id===task.owner_id?'selected':''}>${p.name}${p.is_client?' (client)':''}</option>`).join('');
      const addNew = `<option value="__add_person__" style="font-style:italic">+ Add person…</option>`;
      return `<select class="g-in" data-id="${task.id}" data-col="owner_id" style="${baseStyle}">${blank}${opts}${addNew}</select>`;
    }
    case 'type': {
      const opts = TYPES.map(([v,l]) => `<option value="${v}" ${v===task.type?'selected':''}>${l}</option>`).join('');
      return `<select class="g-in" data-id="${task.id}" data-col="type" style="${baseStyle}">${opts}</select>`;
    }
    case 'start_date':
      return `<input type="date" class="g-in" data-id="${task.id}" data-col="start_date" ${lockAttr} ${lockTitle}
        value="${task.start_date||''}" style="${baseStyle};font-family:monospace;font-size:12px;${lockStyle}">`;
    case 'end_date':
      return `<input type="date" class="g-in" data-id="${task.id}" data-col="end_date" ${lockAttr} ${lockTitle}
        value="${task.end_date||''}" style="${baseStyle};font-family:monospace;font-size:12px;${lockStyle}">`;
    case 'effort_min': {
      if (isLocked) {
        // Show computed value as text instead of an editable select
        const label = EFFORT.find(([v]) => v === task.effort_min)?.[1] || (task.effort_min ? task.effort_min + 'm' : '—');
        return `<span title="Rolled up from children" style="font-size:12px;font-family:monospace;color:#6B7280;padding:0 4px">${label}</span>`;
      }
      const opts = EFFORT.map(([v,l]) => `<option value="${v}" ${v===task.effort_min?'selected':''}>${l}</option>`).join('');
      return `<select class="g-in" data-id="${task.id}" data-col="effort_min" style="${baseStyle}">${opts}</select>`;
    }
    case 'sprint_id': {
      const blank = `<option value="" ${!task.sprint_id?'selected':''}>Backlog</option>`;
      const opts = sprints.map(s => `<option value="${s.id}" ${s.id===task.sprint_id?'selected':''}>${s.name}</option>`).join('');
      return `<select class="g-in" data-id="${task.id}" data-col="sprint_id" style="${baseStyle}">${blank}${opts}</select>`;
    }
    case 'progress':
      return `<input type="number" class="g-in" data-id="${task.id}" data-col="progress" ${lockAttr} ${lockTitle}
        min="0" max="100" value="${task.progress||0}" style="${baseStyle};text-align:right;font-family:monospace;font-size:12px;${lockStyle}">`;
  }
  return '';
}

// ─── row HTML ────────────────────────────────────────────────────────────────
function rowHTML(task, indent, cols, widths, ctx, hasChildren, isCollapsed, isSelected) {
  const bg    = isSelected                ? 'rgba(83,74,183,.08)'   :
                task.type==='phase'       ? 'rgba(83,74,183,.04)'   :
                task.type==='deliverable' ? 'rgba(29,158,117,.03)'  :
                task.type==='milestone'   ? 'rgba(186,117,23,.03)'  : '#fff';
  const strip = task.type==='phase'       ? '#534AB7' :
                task.type==='deliverable' ? '#1D9E75' :
                task.type==='milestone'   ? '#BA7517' : 'transparent';

  const checkCell = `<td class="g-check-cell" data-id="${task.id}"
    style="width:36px;min-width:36px;max-width:36px;padding:0;border-bottom:1px solid rgba(0,0,0,.06);
           border-right:1px solid rgba(0,0,0,.04);text-align:center;background:${bg};cursor:pointer">
    <input type="checkbox" class="g-check" data-id="${task.id}" ${isSelected?'checked':''}
      style="cursor:pointer;margin:0;accent-color:#534AB7">
  </td>`;

  const cells = cols.map(colId => {
    const w   = widths[colId];
    const ipl = colId === 'name' ? 14 + indent*20 : 8;
    const stripEl = colId==='name'
      ? `<span style="position:absolute;left:0;top:0;bottom:0;width:3px;background:${strip}"></span>` : '';
    // Wrap mode: allow the row to grow and long text to break onto multiple lines
    const cellH = ctx.wrap ? 'min-height:38px' : 'height:38px';
    const innerOverflow = ctx.wrap ? '' : 'overflow:hidden';
    return `<td class="g-cell" data-id="${task.id}" data-col="${colId}"
      style="position:relative;${cellH};padding:0;border-bottom:1px solid rgba(0,0,0,.06);
             border-right:1px solid rgba(0,0,0,.04);width:${w}px;min-width:${w}px;max-width:${w}px;overflow:hidden;background:${bg};vertical-align:top">
      ${stripEl}
      <div class="g-inner" style="display:flex;align-items:${ctx.wrap?'flex-start':'center'};padding:${ctx.wrap?'8px':'0'} 8px 0 ${ipl}px;${ctx.wrap?'':'height:100%;'}${innerOverflow};gap:2px;${ctx.wrap?'min-height:38px':''}">
        ${cellHTML(colId, task, ctx, hasChildren, isCollapsed)}
      </div>
    </td>`;
  }).join('');
  return `<tr class="g-row" data-id="${task.id}">${checkCell}${cells}<td style="border-bottom:1px solid rgba(0,0,0,.06)"></td></tr>`;
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

// ─── parent rollup ───────────────────────────────────────────────────────────
// Aggregates all rollup fields (status, dates, effort, progress) from children.
// Status rule:
//   - if any child is 'blocked' → parent is 'blocked'
//   - else if any child is 'in-progress' → parent is 'in-progress'
//   - else if any child is 'review' → parent is 'review'
//   - else if all children are 'done' → parent is 'done'
//   - else → 'todo'
function computeParentStatus(children) {
  if (!children.length) return null;
  const statuses = children.map(c => c.status);
  if (statuses.includes('blocked'))     return 'blocked';
  if (statuses.includes('in-progress')) return 'in-progress';
  if (statuses.includes('review'))      return 'review';
  if (statuses.every(s => s === 'done')) return 'done';
  return 'todo';
}

function rollupParent(parentId, db, allTasks) {
  if (!parentId) return;
  const parent = db.get('tasks', parentId);
  if (!parent) return;
  const children = allTasks.filter(t => t.parent_id === parentId);
  if (!children.length) return;

  const starts   = children.map(c => c.start_date).filter(Boolean).sort();
  const ends     = children.map(c => c.end_date).filter(Boolean).sort();
  const efforts  = children.map(c => c.effort_min || 0);
  const progs    = children.map(c => c.progress || 0);
  const newStatus = computeParentStatus(children);

  const patch = {};
  if (starts.length)          patch.start_date  = starts[0];
  if (ends.length)            patch.end_date    = ends[ends.length - 1];
  patch.effort_min = efforts.reduce((a,b) => a+b, 0);
  patch.progress   = Math.round(progs.reduce((a,b) => a+b, 0) / children.length);
  if (newStatus)              patch.status      = newStatus;

  db.update('tasks', parentId, patch);
  rollupParent(parent.parent_id, db, allTasks);
}

// Keep old name as alias for compatibility
const rollupParentDates = rollupParent;

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

// ─── bulk operations ─────────────────────────────────────────────────────────
// Indent all selected task ids: each becomes a child of the row above the
// FIRST (topmost) selected row. The row above is determined from the current
// visible/hierarchical sort order.
function bulkIndent(selectedIds, db, allTasks, onRerender) {
  if (!selectedIds.size) return;
  const sorted = [...allTasks].sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
  // Find topmost selected in visual order
  const firstIdx = sorted.findIndex(t => selectedIds.has(t.id));
  if (firstIdx <= 0) return;  // nothing above to be parent
  const parent = sorted[firstIdx - 1];
  // Don't allow the parent to be one of the selected (avoid cycles)
  if (selectedIds.has(parent.id)) return;
  // Also check no selected is an ancestor of parent
  let cur = parent;
  while (cur && cur.parent_id) {
    if (selectedIds.has(cur.parent_id)) return;
    cur = db.get('tasks', cur.parent_id);
  }
  // Apply parent_id to all selected
  selectedIds.forEach(id => {
    db.update('tasks', id, { parent_id: parent.id });
  });
  rollupParentDates(parent.id, db, db.all('tasks').filter(t => t.project_id === parent.project_id));
  onRerender();
}

// Outdent all selected task ids by one level
function bulkOutdent(selectedIds, db, allTasks, onRerender) {
  if (!selectedIds.size) return;
  const projectId = db.get('tasks', [...selectedIds][0])?.project_id;
  const touchedParents = new Set();
  selectedIds.forEach(id => {
    const task = db.get('tasks', id);
    if (!task || !task.parent_id) return;
    const oldParent = db.get('tasks', task.parent_id);
    db.update('tasks', id, { parent_id: oldParent?.parent_id || null });
    touchedParents.add(task.parent_id);
  });
  const all = db.all('tasks').filter(t => t.project_id === projectId);
  touchedParents.forEach(pid => rollupParentDates(pid, db, all));
  onRerender();
}

// Delete all selected
function bulkDelete(selectedIds, db, onRerender) {
  selectedIds.forEach(id => db.remove('tasks', id));
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
// Column preferences (order, widths, hidden set, wrap) persist to localStorage so
// they survive reloads. Everything else resets each session.
const GRID_PREFS_KEY = 'planr_grid_prefs_v1';

function loadPrefs() {
  try {
    const raw = localStorage.getItem(GRID_PREFS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    // Sanity: ensure every stored col is still in ALL_COLS; drop unknowns
    const known = new Set(ALL_COLS.map(c => c.id));
    p.cols   = (p.cols || []).filter(c => known.has(c));
    // Append any newly-added columns that weren't in the saved set
    ALL_COLS.forEach(c => { if (!p.cols.includes(c.id) && !(p.hidden || []).includes(c.id)) p.cols.push(c.id); });
    p.widths = p.widths || {};
    ALL_COLS.forEach(c => { if (!p.widths[c.id]) p.widths[c.id] = c.w; });
    p.hidden = new Set(p.hidden || []);
    p.wrap   = !!p.wrap;
    return p;
  } catch (e) { return null; }
}

function savePrefs() {
  try {
    localStorage.setItem(GRID_PREFS_KEY, JSON.stringify({
      cols: G.cols,
      widths: G.widths,
      hidden: [...G.hidden],
      wrap: G.wrap,
    }));
  } catch (e) { /* no-op if quota / disabled */ }
}

const _persisted = loadPrefs();

let G = {
  cols:      _persisted?.cols   || ALL_COLS.map(c => c.id),
  widths:    _persisted?.widths || Object.fromEntries(ALL_COLS.map(c => [c.id, c.w])),
  hidden:    _persisted?.hidden || new Set(),  // column ids currently hidden
  wrap:      _persisted?.wrap   ?? false,       // wrap long text vs ellipsize
  collapsed: new Set(),   // task ids whose children are hidden
  selected:  new Set(),   // task ids currently selected for bulk ops
  lastClickedId: null,    // for shift+click range selection
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

  // One-shot rollup pass: ensure parent values reflect current children.
  // Roll up from deepest first so nested parents get correct totals.
  const parentIds = [...childrenOf.keys()];
  const depthOf = id => {
    let d = 0;
    let cur = db.get('tasks', id);
    while (cur && cur.parent_id) { d++; cur = db.get('tasks', cur.parent_id); }
    return d;
  };
  parentIds.sort((a, b) => depthOf(b) - depthOf(a));  // deepest first
  parentIds.forEach(pid => rollupParent(pid, db, tasks));

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

  const cols = G.cols.filter(c => !G.hidden.has(c));
  const colspan = cols.length + 2;  // +1 for checkbox, +1 for the trailing filler col
  const ctx = { people, sprints, wrap: G.wrap };

  const anySelected = G.selected.size > 0;
  const allVisibleSelected = tasks.length > 0 && tasks.every(t => G.selected.has(t.id));
  const checkTh = `<th style="position:sticky;top:0;z-index:2;background:#F0F1F4;
    border-bottom:1px solid rgba(0,0,0,.1);border-right:1px solid rgba(0,0,0,.06);
    width:36px;min-width:36px;padding:0;text-align:center;height:32px">
    <input type="checkbox" id="gCheckAll" ${allVisibleSelected?'checked':''}
      style="cursor:pointer;margin:0;accent-color:#534AB7"></th>`;

  const ths = cols.map(colId => {
    const col = ALL_COLS.find(c => c.id === colId) || { label: colId };
    return `<th data-col="${colId}" draggable="true" class="g-th"
      style="position:sticky;top:0;z-index:2;background:#F0F1F4;text-align:left;
             border-bottom:1px solid rgba(0,0,0,.1);border-right:1px solid rgba(0,0,0,.06);
             padding:0 10px;height:32px;font-size:10px;font-weight:600;color:#9CA3AF;
             text-transform:uppercase;letter-spacing:.05em;width:${G.widths[colId]}px;
             min-width:${G.widths[colId]}px;white-space:nowrap;user-select:none;
             cursor:grab;position:sticky">
      <span style="pointer-events:none">${col.label}</span>
      <div class="g-th-resize" data-col="${colId}"
        style="position:absolute;top:0;right:0;width:6px;height:100%;cursor:col-resize;
               background:transparent;z-index:3"
        onmouseover="this.style.background='rgba(83,74,183,.2)'"
        onmouseout="this.style.background='transparent'"></div>
    </th>`;
  }).join('');

  let bodyHTML = '';
  groups.forEach((group, key) => {
    if (!group.rows.length && key !== '__none') return;
    const dl = key !== '__none' ? deliverables.find(d => d.id === key) : null;
    bodyHTML += groupHeaderHTML(group.label, group.rows.length, colspan, dl ? '#1D9E75' : '#9CA3AF');
    group.rows.forEach(({task, indent, hasChildren, isCollapsed}) => {
      const isSelected = G.selected.has(task.id);
      bodyHTML += rowHTML(task, indent, cols, G.widths, ctx, hasChildren, isCollapsed, isSelected);
    });
    bodyHTML += addRowHTML(key, colspan);
  });

  // Preserve scroll position across rerenders
  const oldScroll = mount.querySelector('#gScroll');
  const savedScrollTop  = oldScroll ? oldScroll.scrollTop : 0;
  const savedScrollLeft = oldScroll ? oldScroll.scrollLeft : 0;

  mount.innerHTML = `
    <div style="flex:1;overflow:auto;background:#fff;position:relative" id="gScroll">
      <div style="padding:8px 14px;display:flex;align-items:center;gap:12px;border-bottom:1px solid rgba(0,0,0,.06);background:#F8F9FB">
        <button class="g-tool" id="gExpandAll" style="border:0;background:transparent;font-size:11px;color:#6B7280;cursor:pointer;display:flex;align-items:center;gap:4px;padding:3px 6px;border-radius:5px">
          <i class="ti ti-chevrons-down" style="font-size:12px"></i>Expand all</button>
        <button class="g-tool" id="gCollapseAll" style="border:0;background:transparent;font-size:11px;color:#6B7280;cursor:pointer;display:flex;align-items:center;gap:4px;padding:3px 6px;border-radius:5px">
          <i class="ti ti-chevrons-up" style="font-size:12px"></i>Collapse all</button>
        <span style="flex:1"></span>
        <button class="g-tool" id="gWrapToggle" style="border:0;background:${G.wrap?'rgba(83,74,183,.1)':'transparent'};font-size:11px;color:${G.wrap?'#534AB7':'#6B7280'};cursor:pointer;display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:5px">
          <i class="ti ti-text-wrap" style="font-size:12px"></i>${G.wrap?'Wrap on':'Wrap off'}</button>
        <button class="g-tool" id="gColsBtn" style="border:0;background:transparent;font-size:11px;color:#6B7280;cursor:pointer;display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:5px">
          <i class="ti ti-columns" style="font-size:12px"></i>Columns</button>
      </div>
      <div id="gColsMenu" style="display:none;position:absolute;top:44px;right:14px;background:#fff;border:.5px solid rgba(0,0,0,.12);border-radius:9px;box-shadow:0 4px 20px rgba(0,0,0,.14);z-index:210;min-width:220px;padding:8px 0"></div>
      <table id="gTable" style="width:100%;border-collapse:collapse;table-layout:fixed">
        <colgroup><col style="width:36px">${cols.map(c => `<col style="width:${G.widths[c]}px">`).join('')}<col></colgroup>
        <thead><tr>${checkTh}${ths}<th style="background:#F0F1F4;border-bottom:1px solid rgba(0,0,0,.1)"></th></tr></thead>
        <tbody>${bodyHTML}</tbody>
      </table>
      <div id="gCtx" style="display:none;position:absolute;background:#fff;border:.5px solid rgba(0,0,0,.12);border-radius:9px;box-shadow:0 4px 20px rgba(0,0,0,.14);z-index:200;min-width:220px;padding:4px 0"></div>
    </div>`;

  const table  = mount.querySelector('#gTable');
  const scroll = mount.querySelector('#gScroll');
  const ctxEl  = mount.querySelector('#gCtx');

  // Restore scroll position (must happen after innerHTML but before user sees the flash)
  scroll.scrollTop  = savedScrollTop;
  scroll.scrollLeft = savedScrollLeft;

  // ─── SELECTION HANDLERS ────────────────────────────────────────────────
  // Get the visible order of task IDs for shift-click range selection
  function getVisibleTaskIds() {
    return [...table.querySelectorAll('.g-row')].map(r => r.dataset.id);
  }

  // Toggle a single selection
  function toggleSelect(id) {
    if (G.selected.has(id)) G.selected.delete(id);
    else G.selected.add(id);
    G.lastClickedId = id;
    onRerender();
  }

  // Range selection between last clicked and new
  function rangeSelect(id) {
    const ids = getVisibleTaskIds();
    const last = G.lastClickedId;
    if (!last) { toggleSelect(id); return; }
    const iStart = ids.indexOf(last);
    const iEnd   = ids.indexOf(id);
    if (iStart === -1 || iEnd === -1) { toggleSelect(id); return; }
    const [lo, hi] = [Math.min(iStart, iEnd), Math.max(iStart, iEnd)];
    for (let i = lo; i <= hi; i++) G.selected.add(ids[i]);
    G.lastClickedId = id;
    onRerender();
  }

  // Handle checkbox clicks — support click (single), shift+click (range), cmd+click (toggle)
  table.addEventListener('click', e => {
    const check = e.target.closest('.g-check');
    if (!check) return;
    e.stopPropagation();
    const id = check.dataset.id;
    if (e.shiftKey) {
      rangeSelect(id);
    } else {
      toggleSelect(id);
    }
  });

  // Also allow clicking anywhere on the check cell (not just the tiny checkbox)
  table.addEventListener('click', e => {
    if (e.target.closest('.g-check')) return;  // handled above
    const cell = e.target.closest('.g-check-cell');
    if (!cell) return;
    e.stopPropagation();
    const id = cell.dataset.id;
    if (e.shiftKey) rangeSelect(id);
    else toggleSelect(id);
  });

  // Select all checkbox
  const checkAll = mount.querySelector('#gCheckAll');
  if (checkAll) {
    checkAll.addEventListener('click', e => {
      e.stopPropagation();
      if (checkAll.checked) {
        tasks.forEach(t => G.selected.add(t.id));
      } else {
        G.selected.clear();
      }
      G.lastClickedId = null;
      onRerender();
    });
  }

  // ─── FLOATING ACTION BAR ───────────────────────────────────────────────
  if (G.selected.size > 0) {
    const bar = document.createElement('div');
    bar.style.cssText = `position:absolute;bottom:20px;left:50%;transform:translateX(-50%);
      background:#1A1A22;color:#fff;padding:10px 8px 10px 18px;border-radius:10px;
      box-shadow:0 8px 32px rgba(0,0,0,.24);z-index:150;display:flex;align-items:center;gap:4px;
      font-size:13px;font-weight:500`;
    bar.innerHTML = `
      <span style="margin-right:14px;color:#E0E0E5">${G.selected.size} selected</span>
      <button data-act="indent"  style="background:transparent;border:0;color:#fff;cursor:pointer;padding:6px 10px;border-radius:6px;font-size:12.5px;display:flex;align-items:center;gap:5px">
        <i class="ti ti-indent-increase" style="font-size:14px"></i>Indent</button>
      <button data-act="outdent" style="background:transparent;border:0;color:#fff;cursor:pointer;padding:6px 10px;border-radius:6px;font-size:12.5px;display:flex;align-items:center;gap:5px">
        <i class="ti ti-indent-decrease" style="font-size:14px"></i>Outdent</button>
      <button data-act="delete"  style="background:transparent;border:0;color:#FCA5A5;cursor:pointer;padding:6px 10px;border-radius:6px;font-size:12.5px;display:flex;align-items:center;gap:5px">
        <i class="ti ti-trash" style="font-size:14px"></i>Delete</button>
      <span style="width:1px;height:20px;background:rgba(255,255,255,.15);margin:0 4px"></span>
      <button data-act="clear"   style="background:transparent;border:0;color:#9CA3AF;cursor:pointer;padding:6px 10px;border-radius:6px;font-size:12.5px">Clear</button>
    `;
    bar.querySelectorAll('button').forEach(b => {
      b.addEventListener('mouseover', () => b.style.background = 'rgba(255,255,255,.08)');
      b.addEventListener('mouseout',  () => b.style.background = 'transparent');
    });
    bar.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const act = btn.dataset.act;
      const allTasks = db.all('tasks').filter(t => t.project_id === projectId);
      if (act === 'indent') {
        bulkIndent(new Set(G.selected), db, allTasks, onRerender);
      } else if (act === 'outdent') {
        bulkOutdent(new Set(G.selected), db, allTasks, onRerender);
      } else if (act === 'delete') {
        if (confirm(`Delete ${G.selected.size} task${G.selected.size===1?'':'s'}?`)) {
          bulkDelete(new Set(G.selected), db, onRerender);
          G.selected.clear();
        }
      } else if (act === 'clear') {
        G.selected.clear();
        onRerender();
      }
    });
    scroll.appendChild(bar);
  }


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

  // ─── wrap toggle ─────────────────────────────────────────────────────
  mount.querySelector('#gWrapToggle').addEventListener('click', () => {
    G.wrap = !G.wrap;
    savePrefs();
    onRerender();
  });

  // ─── columns menu (show/hide) ────────────────────────────────────────
  const colsBtn  = mount.querySelector('#gColsBtn');
  const colsMenu = mount.querySelector('#gColsMenu');
  function renderColsMenu() {
    colsMenu.innerHTML = `
      <div style="padding:6px 12px 8px;border-bottom:.5px solid rgba(0,0,0,.06);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9CA3AF">Show columns</div>
      ${ALL_COLS.map(c => {
        const visible = !G.hidden.has(c.id);
        return `<label style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;font-size:12px;color:#374151" onmouseover="this.style.background='rgba(83,74,183,.05)'" onmouseout="this.style.background='transparent'">
          <input type="checkbox" class="col-tgl" data-col="${c.id}" ${visible?'checked':''}
                 style="cursor:pointer;margin:0;accent-color:#534AB7">
          <span style="flex:1">${c.label}</span>
        </label>`;
      }).join('')}
      <div style="border-top:.5px solid rgba(0,0,0,.06);padding:6px 4px 4px">
        <button id="colsReset" style="width:100%;text-align:left;background:transparent;border:0;padding:6px 8px;font-size:11px;color:#6B7280;cursor:pointer;border-radius:5px" onmouseover="this.style.background='rgba(0,0,0,.04)'" onmouseout="this.style.background='transparent'">Reset column order & widths</button>
      </div>
    `;
    colsMenu.querySelectorAll('.col-tgl').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.col;
        if (cb.checked) G.hidden.delete(id);
        else G.hidden.add(id);
        savePrefs();
        onRerender();
      });
    });
    colsMenu.querySelector('#colsReset').addEventListener('click', () => {
      G.cols   = ALL_COLS.map(c => c.id);
      G.widths = Object.fromEntries(ALL_COLS.map(c => [c.id, c.w]));
      G.hidden = new Set();
      savePrefs();
      onRerender();
    });
  }
  colsBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (colsMenu.style.display === 'block') { colsMenu.style.display = 'none'; return; }
    renderColsMenu();
    colsMenu.style.display = 'block';
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#gColsMenu') && !e.target.closest('#gColsBtn')) {
      colsMenu.style.display = 'none';
    }
  });

  // ─── auto-resize name textareas in wrap mode ─────────────────────────
  if (G.wrap) {
    const autoresize = ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    mount.querySelectorAll('.g-name-ta').forEach(ta => {
      autoresize(ta);
      ta.addEventListener('input', () => autoresize(ta));
    });
  }

  // ─── column resize (drag right edge of header) ─────────────────────
  mount.querySelectorAll('.g-th-resize').forEach(grip => {
    grip.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      const colId = grip.dataset.col;
      const startX = e.clientX;
      const startW = G.widths[colId] || 120;
      const onMove = ev => {
        const nw = Math.max(50, startW + (ev.clientX - startX));
        G.widths[colId] = nw;
        // Live update without full rerender
        mount.querySelectorAll(`th[data-col="${colId}"]`).forEach(th => {
          th.style.width = nw + 'px';
          th.style.minWidth = nw + 'px';
        });
        mount.querySelectorAll(`td[data-col="${colId}"]`).forEach(td => {
          td.style.width = nw + 'px';
          td.style.minWidth = nw + 'px';
          td.style.maxWidth = nw + 'px';
        });
        const cgIdx = G.cols.filter(c => !G.hidden.has(c)).indexOf(colId);
        if (cgIdx >= 0) {
          const cg = mount.querySelector('#gTable > colgroup');
          if (cg && cg.children[cgIdx + 1]) cg.children[cgIdx + 1].style.width = nw + 'px';
        }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        savePrefs();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  // ─── column drag-reorder ─────────────────────────────────────────────
  let dragColId = null;
  mount.querySelectorAll('.g-th').forEach(th => {
    th.addEventListener('dragstart', e => {
      // Ignore if starting on the resize grip
      if (e.target.classList?.contains('g-th-resize')) { e.preventDefault(); return; }
      dragColId = th.dataset.col;
      e.dataTransfer.effectAllowed = 'move';
      // Firefox needs some data
      try { e.dataTransfer.setData('text/plain', dragColId); } catch (_) {}
      th.style.opacity = '0.5';
    });
    th.addEventListener('dragend', () => {
      th.style.opacity = '';
      mount.querySelectorAll('.g-th').forEach(t => t.style.borderLeft = '');
      dragColId = null;
    });
    th.addEventListener('dragover', e => {
      if (!dragColId || dragColId === th.dataset.col) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      th.style.borderLeft = '2px solid #534AB7';
    });
    th.addEventListener('dragleave', () => {
      th.style.borderLeft = '';
    });
    th.addEventListener('drop', e => {
      e.preventDefault();
      const targetColId = th.dataset.col;
      if (!dragColId || dragColId === targetColId) return;
      // Reorder G.cols: remove dragColId, insert before targetColId
      const arr = [...G.cols];
      const from = arr.indexOf(dragColId);
      let to = arr.indexOf(targetColId);
      if (from < 0 || to < 0) return;
      arr.splice(from, 1);
      // Adjust target index if we removed something before it
      if (from < to) to--;
      arr.splice(to, 0, dragColId);
      G.cols = arr;
      savePrefs();
      onRerender();
    });
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

    // Handle "+ Add person…" from owner dropdown
    if (colId === 'owner_id' && value === '__add_person__') {
      const name = prompt('Person name:');
      if (!name || !name.trim()) {
        // Reset dropdown and abort
        el.value = task.owner_id || '';
        return;
      }
      const trimmed = name.trim();
      const initials = trimmed.split(/\s+/).map(w => w[0]||'').join('').slice(0,2).toUpperCase() || '?';
      // Pick a colour from a palette based on hash of name
      const palette = ['#5B7FCC','#5B9E7F','#9B67C2','#C47B3E','#D4716A','#7F77DD','#1D9E75','#BA7517'];
      const hash = [...trimmed].reduce((a,c) => a + c.charCodeAt(0), 0);
      const color = palette[hash % palette.length];
      const newPerson = db.insert('people', {
        name: trimmed, initials, color, is_client: false, org: null,
      });
      // Assign them as owner
      db.update('tasks', taskId, { owner_id: newPerson.id });
      onRerender();
      return;
    }

    const patch = { [colId]: value };
    if (colId === 'progress' && value != null && value >= 100) patch.status = 'done';
    if (colId === 'progress' && value != null && value < 100 && task.status === 'done') patch.status = 'in-progress';
    db.update('tasks', taskId, patch);

    // Roll up to parents on any rolled-up field change
    const ROLLUP_FIELDS = ['status','start_date','end_date','effort_min','progress'];
    if (ROLLUP_FIELDS.includes(colId) && task.parent_id) {
      rollupParent(task.parent_id, db, db.all('tasks').filter(t => t.project_id === projectId));
    }

    // Auto-create meeting when task type changes to 'meeting'
    if (colId === 'type' && value === 'meeting') {
      const existing = db.all('meetings').find(m => m.linked_task_id === taskId);
      if (!existing) {
        db.insert('meetings', {
          project_id: projectId,
          title: task.name || 'New meeting',
          date: task.start_date || new Date().toISOString().slice(0, 10),
          start_time: '09:00',
          duration_min: 55,
          notes: null,
          linked_task_id: taskId,
        });
      }
    }

    // Keep the linked meeting in sync when a 'meeting' task's name or date changes
    if (task.type === 'meeting' || (colId === 'type' && value === 'meeting')) {
      const linked = db.all('meetings').find(m => m.linked_task_id === taskId);
      if (linked) {
        const meetingPatch = {};
        if (colId === 'name')       meetingPatch.title = value || 'Untitled meeting';
        if (colId === 'start_date') meetingPatch.date  = value || new Date().toISOString().slice(0, 10);
        if (Object.keys(meetingPatch).length) db.update('meetings', linked.id, meetingPatch);
      }
    }

    // Rerender on any change that affects appearance or hierarchy
    if (ROLLUP_FIELDS.includes(colId) || colId === 'type') {
      onRerender();
    }
  });

  // Name text input — save on blur
  table.addEventListener('blur', e => {
    const el = e.target.closest('.g-in');
    if (!el || el.dataset.col !== 'name') return;
    const task = db.get('tasks', el.dataset.id);
    if (!task) return;
    if ((task.name || '') !== el.value) {
      db.update('tasks', el.dataset.id, { name: el.value });
      // Sync meeting title if this is a meeting-type task
      if (task.type === 'meeting') {
        const linked = db.all('meetings').find(m => m.linked_task_id === task.id);
        if (linked) db.update('meetings', linked.id, { title: el.value || 'Untitled meeting' });
      }
    }
  }, true);

  // Enter = new row below, Tab = indent/outdent
  table.addEventListener('keydown', e => {
    const el = e.target.closest('.g-in');
    if (!el || el.dataset.col !== 'name') return;
    if (e.key === 'Enter') {
      // In wrap mode: Shift+Enter inserts a newline; plain Enter still creates a new row.
      if (G.wrap && e.shiftKey) return;   // let the textarea handle it
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

  // ─── hover drag handle & open button ──────────────────────────────────
  table.addEventListener('mouseover', e => {
    const row = e.target.closest('.g-row');
    if (row) row.querySelectorAll('.g-drag, .g-open').forEach(h => h.style.opacity = '1');
  });
  table.addEventListener('mouseout', e => {
    const row = e.target.closest('.g-row');
    if (row && !row.matches(':hover')) row.querySelectorAll('.g-drag, .g-open').forEach(h => h.style.opacity = '0');
  });

  // Open task drill-down when the open button is clicked
  table.addEventListener('click', e => {
    const btn = e.target.closest('.g-open');
    if (!btn) return;
    e.stopPropagation();
    onSelect?.(btn.dataset.id);
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
