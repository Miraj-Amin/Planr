// gridView.js — inline-editable spreadsheet grid for the Plan tab.
// Click any cell → edit inline. Enter = new row. Tab = next column.
// Tab on name = indent. Shift+Tab on name = outdent.
// Right-click for context menu with type change / insert / delete.

import { fmt } from '../lib/dates.js';

// ─── column defs ─────────────────────────────────────────────────────────────
const ALL_COLS = [
  { id:'name',          label:'Task',     w:320 },
  { id:'status',        label:'Status',   w:120 },
  { id:'owner_id',      label:'Owner',    w:110 },
  { id:'type',          label:'Type',     w:90  },
  { id:'start_date',    label:'Start',    w:92  },
  { id:'end_date',      label:'Due',      w:92  },
  { id:'duration_days', label:'Dur',      w:58  },
  { id:'effort_min',    label:'Effort',   w:72  },
  { id:'sprint_id',     label:'Sprint',   w:110 },
  { id:'progress',      label:'%',        w:72  },
];

const STATUSES = ['todo','in-progress','blocked','review','done'];
const STATUS_L = {todo:'To do','in-progress':'In progress',blocked:'Blocked',review:'Review',done:'Done'};
const STATUS_C = {todo:'#A0A7B4','in-progress':'#7F77DD',blocked:'#E24B4A',review:'#BA7517',done:'#1D9E75'};
const TYPES    = ['task','deliverable','milestone','agenda','followup','phase'];
const EFFORT   = [[0,'—'],[15,'15m'],[30,'30m'],[60,'1h'],[120,'2h'],[240,'4h'],[480,'1d']];
const TYPE_C   = {task:'#6B7280',deliverable:'#1D9E75',milestone:'#BA7517',agenda:'#378ADD',followup:'#D4716A',phase:'#534AB7'};
const TODAY    = new Date();

// Module-level state (persists across rerenders within same session)
let G = {
  cols:            ALL_COLS.map(c => c.id),
  widths:          Object.fromEntries(ALL_COLS.map(c => [c.id, c.w])),
  pendingFocusId:  null,  // task id whose name cell to focus after next render
  dragCol:         null,
  dragOverCol:     null,
};

// Use a small counter (starts at 1_000_000) + row index to give
// unique sort_order values that fit safely in bigint AND integer columns.
// Never uses Date.now() which overflows.
let _sortSeq = 1_000_000;
const nextSort = () => ++_sortSeq;

const effLabel = m => { const e=EFFORT.find(x=>x[0]===m); return e?e[1]:(m?m+'m':'—'); };
const isOverdue= t => { const d=t.end_date?new Date(t.end_date+'T00:00:00'):null; return !!d&&d<TODAY&&t.status!=='done'; };
const av = (p,sz=22) => p
  ? `<span style="display:inline-flex;width:${sz}px;height:${sz}px;border-radius:50%;background:${p.color};
      align-items:center;justify-content:center;font-size:${Math.round(sz*.4)}px;font-weight:500;color:#fff;flex-shrink:0">${p.initials}</span>`
  : '';

// ─── cell display HTML ───────────────────────────────────────────────────────
function cellDisplay(colId, task, ctx) {
  const { people, sprints } = ctx;
  switch (colId) {
    case 'name': {
      const ns = task.type==='phase'?'font-weight:600;color:#3C3489':
                 task.type==='deliverable'?'font-weight:500;color:#0F6E56':
                 task.type==='milestone'?'font-weight:500;color:#854F0B':'';
      const dot = `<span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;background:${STATUS_C[task.status]||'#ccc'}"></span>`;
      const nameText = task.name || '<span style="color:#C4C9D4;font-style:italic">Click to name</span>';
      return `<span style="display:flex;align-items:center;gap:6px;min-width:0;flex:1">
        ${dot}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${ns}">${nameText}</span></span>`;
    }
    case 'status': {
      const c=STATUS_C[task.status]||'#ccc',l=STATUS_L[task.status]||task.status;
      return `<span style="display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;
        font-size:11px;font-weight:500;background:${c}1a;color:${c};white-space:nowrap">${l}</span>`;
    }
    case 'owner_id': {
      const p=people.find(x=>x.id===task.owner_id);
      return p?`<span style="display:flex;align-items:center;gap:6px">${av(p)}<span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</span></span>`
              :'<span style="color:#C4C9D4;font-size:12px">—</span>';
    }
    case 'type': {
      const c=TYPE_C[task.type]||'#6B7280';
      return `<span style="font-size:10px;font-weight:500;padding:2px 7px;border-radius:4px;
        background:${c}1a;color:${c};white-space:nowrap;text-transform:capitalize">${task.type}</span>`;
    }
    case 'start_date':
      return task.start_date?`<span style="font-size:12px;font-family:monospace">${fmt(task.start_date)}</span>`
        :'<span style="color:#C4C9D4;font-size:12px">—</span>';
    case 'end_date': {
      const over=isOverdue(task);
      return task.end_date?`<span style="font-size:12px;font-family:monospace;color:${over?'#E24B4A':'inherit'}">${fmt(task.end_date)}</span>`
        :'<span style="color:#C4C9D4;font-size:12px">—</span>';
    }
    case 'duration_days':
      return task.duration_days?`<span style="font-size:12px;font-family:monospace">${task.duration_days}d</span>`
        :'<span style="color:#C4C9D4;font-size:12px">—</span>';
    case 'effort_min':
      return `<span style="font-size:12px;font-family:monospace">${effLabel(task.effort_min||0)}</span>`;
    case 'sprint_id': {
      const s=sprints.find(x=>x.id===task.sprint_id);
      return s?`<span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name}</span>`
              :'<span style="color:#C4C9D4;font-size:12px">—</span>';
    }
    case 'progress': {
      const pct=task.progress||0;
      return `<span style="display:flex;align-items:center;gap:5px;width:100%">
        <span style="flex:1;height:4px;background:rgba(0,0,0,.08);border-radius:2px;overflow:hidden">
          <span style="display:block;height:100%;width:${pct}%;background:${task.status==='done'?'#1D9E75':'#534AB7'};border-radius:2px"></span></span>
        <span style="font-size:11px;font-family:monospace;color:#9CA3AF;flex-shrink:0;min-width:28px;text-align:right">${pct}%</span></span>`;
    }
    default: return '<span style="color:#C4C9D4">—</span>';
  }
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
      start_date: starts[0]            || parent.start_date,
      end_date:   ends[ends.length-1]  || parent.end_date,
    });
  }
  rollupParentDates(parent.parent_id, db, allTasks);
}

// ─── indent / outdent ────────────────────────────────────────────────────────
function indentTask(taskId, db, allTasks, onRerender) {
  const task   = db.get('tasks', taskId);
  if (!task) return;
  const sorted = [...allTasks].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  const idx    = sorted.findIndex(t=>t.id===taskId);
  const above  = idx>0?sorted[idx-1]:null;
  if (above && above.id!==task.parent_id) {
    db.update('tasks', taskId, {parent_id: above.id});
    rollupParentDates(above.id, db, allTasks);
    onRerender();
  }
}
function outdentTask(taskId, db, allTasks, onRerender) {
  const task = db.get('tasks', taskId);
  if (!task || !task.parent_id) return;
  const oldParent = db.get('tasks', task.parent_id);
  db.update('tasks', taskId, {parent_id: oldParent?.parent_id||null});
  rollupParentDates(task.parent_id, db, allTasks);
  onRerender();
}

// ─── row / group / add-row HTML ──────────────────────────────────────────────
function rowHTML(task, indent, ctx) {
  const bg    = task.type==='phase'       ? 'rgba(83,74,183,.04)'   :
                task.type==='deliverable' ? 'rgba(29,158,117,.03)'  :
                task.type==='milestone'   ? 'rgba(186,117,23,.03)'  : '#fff';
  const strip = task.type==='phase'       ? '#534AB7' :
                task.type==='deliverable' ? '#1D9E75' :
                task.type==='milestone'   ? '#BA7517' : 'transparent';

  const cells = G.cols.map(colId => {
    const w   = G.widths[colId];
    const ipl = colId==='name' ? 14 + indent*20 : 10;
    const leftStrip  = colId==='name' ? `<span style="position:absolute;left:0;top:0;bottom:0;width:3px;background:${strip}"></span>` : '';
    return `<td class="g-cell" data-id="${task.id}" data-col="${colId}"
      style="position:relative;height:36px;padding:0;border-bottom:1px solid rgba(0,0,0,.05);
             border-right:1px solid rgba(0,0,0,.04);width:${w}px;min-width:${w}px;max-width:${w}px;overflow:hidden">
      ${leftStrip}
      <div class="g-cell-inner" style="display:flex;align-items:center;padding:0 10px 0 ${ipl}px;
           height:100%;gap:4px;overflow:hidden;min-width:0;cursor:cell">
        ${cellDisplay(colId, task, ctx)}
      </div>
    </td>`;
  }).join('');
  return `<tr class="g-row" data-id="${task.id}" style="background:${bg}">${cells}
    <td style="border-bottom:1px solid rgba(0,0,0,.05)"></td></tr>`;
}

function groupHeaderHTML(label, count, color='#1D9E75') {
  return `<tr class="g-group-hd"><td colspan="${G.cols.length+1}" style="padding:0">
    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px 8px;background:rgba(0,0,0,.02);border-bottom:1px solid rgba(0,0,0,.06)">
      <span style="font-size:11px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:.05em">${label}</span>
      <span style="font-size:10px;color:#9CA3AF;background:rgba(0,0,0,.06);padding:1px 7px;border-radius:10px">${count}</span>
    </div>
  </td></tr>`;
}

function addRowHTML(groupKey) {
  return `<tr class="g-add-row" data-group="${groupKey}" style="cursor:pointer">
    <td colspan="${G.cols.length+1}" style="padding:6px 14px 8px;border-bottom:1px solid rgba(0,0,0,.04)">
      <span style="font-size:12px;color:#9CA3AF;display:flex;align-items:center;gap:5px;user-select:none">
        <i class="ti ti-plus" style="font-size:11px"></i>Add task</span>
    </td>
  </tr>`;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export function renderGrid({ mount, tasks, people, deliverables, sprints, db, projectId, onSelect, onRerender }) {
  const ctx = { people, deliverables, sprints };

  // Bump _sortSeq past any existing sort_orders so new tasks sort last
  const maxSort = Math.max(_sortSeq, ...tasks.map(t=>t.sort_order||0));
  _sortSeq = maxSort;

  // Build hierarchy
  function collectRows(taskId, indent) {
    const t = tasks.find(x=>x.id===taskId);
    if (!t) return [];
    const children = tasks.filter(x=>x.parent_id===taskId).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    return [{task:t,indent},...children.flatMap(c=>collectRows(c.id,indent+1))];
  }

  // Group by deliverable
  const groups = new Map();
  [...deliverables].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).forEach(d => groups.set(d.id, {label:d.name, rows:[]}));
  groups.set('__none', {label:'No deliverable', rows:[]});
  tasks.filter(t=>!t.parent_id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).forEach(t => {
    const key = (t.deliverable_id && groups.has(t.deliverable_id)) ? t.deliverable_id : '__none';
    groups.get(key).rows.push(...collectRows(t.id, 0));
  });

  // Header
  const ths = G.cols.map(colId => {
    const col = ALL_COLS.find(c=>c.id===colId) || {label:colId};
    return `<th class="g-col-hd" data-col="${colId}" draggable="true"
      style="position:sticky;top:0;z-index:2;background:#F0F1F4;text-align:left;vertical-align:middle;
             border-bottom:1px solid rgba(0,0,0,.1);border-right:1px solid rgba(0,0,0,.06);
             padding:0 10px;height:30px;font-size:10px;font-weight:600;color:#9CA3AF;
             text-transform:uppercase;letter-spacing:.05em;width:${G.widths[colId]}px;
             min-width:${G.widths[colId]}px;white-space:nowrap;cursor:grab;user-select:none">
      ${col.label}
      <span class="col-resize" data-col="${colId}"
        style="position:absolute;right:0;top:0;bottom:0;width:5px;cursor:col-resize;z-index:3"></span>
    </th>`;
  }).join('');

  // Body
  let bodyHTML = '';
  groups.forEach((group, key) => {
    if (!group.rows.length && key !== '__none') return;
    const dl = key !== '__none' ? deliverables.find(d=>d.id===key) : null;
    bodyHTML += groupHeaderHTML(group.label, group.rows.length, dl ? '#1D9E75' : '#9CA3AF');
    group.rows.forEach(({task, indent}) => { bodyHTML += rowHTML(task, indent, ctx); });
    bodyHTML += addRowHTML(key);
  });

  mount.innerHTML = `
    <div style="flex:1;overflow:auto;background:#fff;position:relative" id="gScroll">
      <table id="gTable" style="width:100%;border-collapse:collapse;table-layout:fixed">
        <colgroup>${G.cols.map(c=>`<col style="width:${G.widths[c]}px">`).join('')}<col></colgroup>
        <thead><tr>${ths}<th style="background:#F0F1F4;border-bottom:1px solid rgba(0,0,0,.1)"></th></tr></thead>
        <tbody id="gBody">${bodyHTML}</tbody>
      </table>
      <div id="gCtx" style="display:none;position:absolute;background:#fff;border:.5px solid rgba(0,0,0,.12);border-radius:9px;box-shadow:0 4px 20px rgba(0,0,0,.14);z-index:200;min-width:210px;padding:4px 0"></div>
    </div>`;

  const table  = mount.querySelector('#gTable');
  const scroll = mount.querySelector('#gScroll');
  const ctxEl  = mount.querySelector('#gCtx');

  // Focus pending new-task cell if any
  if (G.pendingFocusId) {
    const pid = G.pendingFocusId;
    G.pendingFocusId = null;
    requestAnimationFrame(() => {
      const td = mount.querySelector(`td[data-id="${pid}"][data-col="name"]`);
      if (td) activate(td);
    });
  }

  // ─── inline editing ────────────────────────────────────────────────────
  let activeCell = null;
  let currentEditor = null;
  let hasSaved = false;   // guards against double-save (change + blur)

  // Save current edit and rerender the cell to display mode
  function commitAndClose() {
    if (!activeCell || !currentEditor || hasSaved) return;
    hasSaved = true;
    const td = activeCell;
    const colId = td.dataset.col;
    const taskId = td.dataset.id;
    const task = db.get('tasks', taskId);
    if (!task) { activeCell = null; currentEditor = null; return; }

    // Read value from the editor
    let value;
    if (currentEditor.type === 'checkbox') value = currentEditor.checked;
    else if (currentEditor.type === 'number') value = currentEditor.value === '' ? null : +currentEditor.value;
    else if (currentEditor.type === 'date') value = currentEditor.value || null;
    else if (currentEditor.tagName === 'SELECT') value = currentEditor.value || null;
    else value = currentEditor.value; // text

    // Save patch
    const patch = { [colId]: value };
    if (colId === 'progress' && value != null && value >= 100) patch.status = 'done';
    db.update('tasks', taskId, patch);

    // Roll up parent dates if this was a date change
    if ((colId === 'start_date' || colId === 'end_date') && task.parent_id) {
      const allTasks = db.all('tasks').filter(t => t.project_id === task.project_id);
      rollupParentDates(task.parent_id, db, allTasks);
    }

    // Restore display
    const updated = db.get('tasks', taskId);
    td.classList.remove('g-editing');
    const inner = td.querySelector('.g-cell-inner');
    inner.innerHTML = cellDisplay(colId, updated, ctx);

    activeCell = null;
    currentEditor = null;
  }

  // Close without saving (Escape)
  function cancelAndClose() {
    if (!activeCell) return;
    const td = activeCell;
    const task = db.get('tasks', td.dataset.id);
    td.classList.remove('g-editing');
    const inner = td.querySelector('.g-cell-inner');
    if (task) inner.innerHTML = cellDisplay(td.dataset.col, task, ctx);
    activeCell = null;
    currentEditor = null;
  }

  // Activate a cell for editing
  function activate(td) {
    if (activeCell === td) return;
    commitAndClose();  // save previous edit first

    const taskId = td.dataset.id;
    const colId = td.dataset.col;
    const task = db.get('tasks', taskId);
    if (!task) return;

    activeCell = td;
    hasSaved = false;
    td.classList.add('g-editing');
    const inner = td.querySelector('.g-cell-inner');
    inner.innerHTML = '';

    // Build editor
    let editor;
    const baseStyle = 'border:none;outline:none;width:100%;background:transparent;font-size:13px;font-family:inherit;color:#1A1A22;padding:0;height:100%';

    if (colId === 'name') {
      editor = document.createElement('input');
      editor.type = 'text';
      editor.value = task.name || '';
      editor.style.cssText = baseStyle;
    } else if (colId === 'duration_days' || colId === 'progress') {
      editor = document.createElement('input');
      editor.type = 'number';
      editor.min = 0;
      if (colId === 'progress') editor.max = 100;
      editor.value = task[colId] ?? '';
      editor.style.cssText = baseStyle;
    } else if (colId === 'start_date' || colId === 'end_date') {
      editor = document.createElement('input');
      editor.type = 'date';
      editor.value = task[colId] || '';
      editor.style.cssText = baseStyle;
    } else {
      // SELECT for status, owner, type, effort, sprint
      editor = document.createElement('select');
      editor.style.cssText = baseStyle + ';cursor:pointer';
      const addOpt = (v, l, selected) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = l;
        if (selected) o.selected = true;
        editor.appendChild(o);
      };

      if (colId === 'status') {
        STATUSES.forEach(s => addOpt(s, STATUS_L[s], s === task.status));
      } else if (colId === 'owner_id') {
        addOpt('', 'Unassigned', !task.owner_id);
        people.forEach(p => addOpt(p.id, p.name + (p.is_client ? ' (client)' : ''), p.id === task.owner_id));
      } else if (colId === 'type') {
        TYPES.forEach(t => addOpt(t, t, t === task.type));
      } else if (colId === 'effort_min') {
        EFFORT.forEach(([v, l]) => addOpt(v, l, v === task.effort_min));
      } else if (colId === 'sprint_id') {
        addOpt('', 'Backlog', !task.sprint_id);
        sprints.forEach(s => addOpt(s.id, s.name, s.id === task.sprint_id));
      }
    }

    currentEditor = editor;
    inner.appendChild(editor);
    editor.focus();
    if (editor.select) editor.select();

    // ─── event wiring — all editors ────────────────────────────────────
    editor.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelAndClose();
      } else if (e.key === 'Enter' && editor.tagName !== 'SELECT') {
        e.preventDefault();
        // Save current, then create new row below and focus it
        commitAndClose();
        const newTask = db.insert('tasks', {
          project_id: task.project_id, type: 'task', name: '', status: 'todo',
          parent_id: task.parent_id || null, deliverable_id: task.deliverable_id || null,
          sprint_id: task.sprint_id || null, effort_min: 0, priority: 'normal',
          progress: 0, flagged: false, sort_order: nextSort(),
        });
        G.pendingFocusId = newTask.id;
        onRerender();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        // Special: name column + Tab = indent/outdent
        if (colId === 'name') {
          commitAndClose();
          const allTasks = db.all('tasks').filter(t => t.project_id === task.project_id);
          if (dir === 1) indentTask(taskId, db, allTasks, onRerender);
          else outdentTask(taskId, db, allTasks, onRerender);
          return;
        }
        // Otherwise move to next/prev column
        commitAndClose();
        const ci = G.cols.indexOf(colId);
        const nextColId = G.cols[ci + dir];
        if (nextColId) {
          requestAnimationFrame(() => {
            const nextTd = mount.querySelector(`td[data-id="${taskId}"][data-col="${nextColId}"]`);
            if (nextTd) activate(nextTd);
          });
        }
      }
    });

    // For SELECT: commit on change (which fires when user picks)
    if (editor.tagName === 'SELECT') {
      editor.addEventListener('change', () => commitAndClose());
    }

    // For all editors: commit on blur — but only if not already saved
    editor.addEventListener('blur', () => {
      // small delay so change event fires first on selects
      setTimeout(() => { if (!hasSaved) commitAndClose(); }, 0);
    });
  }

  // Click-to-edit anywhere in the table
  table.addEventListener('mousedown', e => {
    if (e.target.closest('.col-resize') || e.target.closest('#gCtx')) return;
    if (e.button !== 0) return;  // left click only
    const td = e.target.closest('.g-cell');
    if (td) {
      e.preventDefault();
      activate(td);
    }
    // Don't deactivate on click outside cells — let blur handle it
  });

  // ─── + Add task ────────────────────────────────────────────────────────
  table.addEventListener('click', e => {
    const addRow = e.target.closest('.g-add-row');
    if (!addRow) return;
    commitAndClose();
    const groupKey = addRow.dataset.group;
    const dl = groupKey !== '__none' ? deliverables.find(d=>d.id===groupKey) : null;
    const newTask = db.insert('tasks', {
      project_id: projectId, type: 'task', name: '', status: 'todo',
      deliverable_id: dl?.id || null, progress: 0, effort_min: 0,
      priority: 'normal', flagged: false, sort_order: nextSort(),
    });
    G.pendingFocusId = newTask.id;
    onRerender();
  });

  // ─── right-click context menu ──────────────────────────────────────────
  function hideCtx() { ctxEl.style.display = 'none'; }

  table.addEventListener('contextmenu', e => {
    const row = e.target.closest('.g-row');
    if (!row) return;
    e.preventDefault();
    commitAndClose();
    const taskId = row.dataset.id;
    const task = db.get('tasks', taskId);
    if (!task) return;
    const allTasks = db.all('tasks').filter(t => t.project_id === projectId);
    const sorted = [...allTasks].sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
    const idx = sorted.findIndex(t => t.id === taskId);
    const above = idx > 0 ? sorted[idx-1] : null;

    const items = [
      {label:`<i class="ti ti-subtask"></i> Mark as <b>task</b>`,        dim:task.type==='task',        action:()=>{db.update('tasks',taskId,{type:'task'});onRerender();hideCtx();}},
      {label:`<i class="ti ti-package"></i> Mark as <b>deliverable</b>`, dim:task.type==='deliverable', action:()=>{db.update('tasks',taskId,{type:'deliverable'});onRerender();hideCtx();}},
      {label:`<i class="ti ti-diamond"></i> Mark as <b>milestone</b>`,   dim:task.type==='milestone',   action:()=>{db.update('tasks',taskId,{type:'milestone'});onRerender();hideCtx();}},
      null,
      {label:`<i class="ti ti-plus"></i> Insert row above`, action:()=>{
        const t=db.insert('tasks',{project_id:projectId,type:'task',name:'',status:'todo',parent_id:task.parent_id||null,deliverable_id:task.deliverable_id||null,effort_min:0,priority:'normal',progress:0,flagged:false,sort_order:(task.sort_order||nextSort())-1});
        G.pendingFocusId=t.id; onRerender(); hideCtx();
      }},
      {label:`<i class="ti ti-plus"></i> Insert row below`, action:()=>{
        const t=db.insert('tasks',{project_id:projectId,type:'task',name:'',status:'todo',parent_id:task.parent_id||null,deliverable_id:task.deliverable_id||null,effort_min:0,priority:'normal',progress:0,flagged:false,sort_order:nextSort()});
        G.pendingFocusId=t.id; onRerender(); hideCtx();
      }},
      null,
      {label:`<i class="ti ti-arrow-right"></i> Indent (make child of row above)`, disabled:!above, action:()=>{indentTask(taskId,db,allTasks,onRerender);hideCtx();}},
      {label:`<i class="ti ti-arrow-left"></i> Outdent (promote to parent level)`,  disabled:!task.parent_id, action:()=>{outdentTask(taskId,db,allTasks,onRerender);hideCtx();}},
      null,
      {label:`<i class="ti ti-message-circle"></i> ${task.flagged?'Remove from agenda':'Flag for next meeting'}`, action:()=>{db.update('tasks',taskId,{flagged:!task.flagged});onRerender();hideCtx();}},
      null,
      {label:`<i class="ti ti-trash" style="color:#E24B4A"></i> <span style="color:#E24B4A">Delete task</span>`, action:()=>{if(confirm(`Delete "${task.name||'untitled'}"?`)){db.remove('tasks',taskId);onRerender();}hideCtx();}},
    ];

    const rect = scroll.getBoundingClientRect();
    ctxEl.innerHTML = items.map(item => item === null
      ? '<div style="height:1px;background:rgba(0,0,0,.07);margin:3px 0"></div>'
      : `<div class="ctx-item" style="padding:7px 14px;font-size:12.5px;cursor:${item.disabled?'default':'pointer'};display:flex;align-items:center;gap:8px;color:${item.disabled?'#C4C9D4':item.dim?'#534AB7':'#1A1A22'};${item.dim?'background:rgba(83,74,183,.06)':''}">${item.label}</div>`
    ).join('');
    ctxEl.style.cssText = `display:block;position:absolute;left:${e.clientX-rect.left+scroll.scrollLeft}px;top:${e.clientY-rect.top+scroll.scrollTop}px;background:#fff;border:.5px solid rgba(0,0,0,.12);border-radius:9px;box-shadow:0 4px 20px rgba(0,0,0,.14);z-index:200;min-width:210px;padding:4px 0`;

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

  // ─── column drag to reorder ────────────────────────────────────────────
  mount.querySelectorAll('.g-col-hd').forEach(th => {
    th.addEventListener('dragstart', e => { G.dragCol = th.dataset.col; e.dataTransfer.effectAllowed = 'move'; });
    th.addEventListener('dragover',  e => { e.preventDefault(); th.classList.add('drag-over'); G.dragOverCol = th.dataset.col; });
    th.addEventListener('dragleave', () => th.classList.remove('drag-over'));
    th.addEventListener('drop', () => {
      th.classList.remove('drag-over');
      if (G.dragCol && G.dragOverCol && G.dragCol !== G.dragOverCol) {
        const from = G.cols.indexOf(G.dragCol);
        const to   = G.cols.indexOf(G.dragOverCol);
        if (from >= 0 && to >= 0) { G.cols.splice(from, 1); G.cols.splice(to, 0, G.dragCol); onRerender(); }
      }
      G.dragCol = null; G.dragOverCol = null;
    });
  });

  // ─── column resize ─────────────────────────────────────────────────────
  mount.querySelectorAll('.col-resize').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const colId = handle.dataset.col;
      const startX = e.clientX, startW = G.widths[colId];
      const onMove = e2 => { G.widths[colId] = Math.max(50, startW + (e2.clientX - startX)); onRerender(); };
      const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  });
}
