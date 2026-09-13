// gridView.js — inline-editable spreadsheet grid for the Plan tab.
// Groups tasks by deliverable. Click any cell to edit inline.
// Enter = new row below.  Tab on name = indent.  Shift+Tab on name = outdent.
// Right-click = context menu with type change, indent/outdent, insert, delete.

import { fmt } from '../lib/dates.js';

// ── column definitions ─────────────────────────────────────────────────────
const ALL_COLS = [
  { id:'name',          label:'Task',     w:320, fixed:true },
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
const TYPE_COLOR = {task:'#6B7280',deliverable:'#1D9E75',milestone:'#BA7517',agenda:'#378ADD',followup:'#D4716A',phase:'#534AB7'};

// grid display state (persists within session)
let G = {
  cols:      ALL_COLS.map(c => c.id),
  widths:    Object.fromEntries(ALL_COLS.map(c => [c.id, c.w])),
  dragCol:   null,
  dragOverCol: null,
};

const TODAY    = new Date(2026, 8, 13);
const effLabel = m => { const e=EFFORT.find(x=>x[0]===m); return e?e[1]:(m?m+'m':'—'); };
const isOverdue= t => { const d=t.end_date?new Date(t.end_date+'T00:00:00'):null; return !!d&&d<TODAY&&t.status!=='done'; };
const av = (p, sz=22) => p
  ? `<span style="display:inline-flex;width:${sz}px;height:${sz}px;border-radius:50%;background:${p.color};
      align-items:center;justify-content:center;font-size:${Math.round(sz*.4)}px;font-weight:500;color:#fff;flex-shrink:0">${p.initials}</span>`
  : '';

// ── cell display ────────────────────────────────────────────────────────────
function cellDisplay(colId, task, ctx) {
  const { people, sprints } = ctx;
  switch (colId) {
    case 'name': {
      const tc = TYPE_COLOR[task.type]||'#6B7280';
      const ns = task.type==='phase'?'font-weight:600;color:#3C3489':
                 task.type==='deliverable'?'font-weight:500;color:#0F6E56':
                 task.type==='milestone'?'font-weight:500;color:#854F0B':'';
      const dot = `<span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;background:${STATUS_C[task.status]||'#ccc'}"></span>`;
      return `<span style="display:flex;align-items:center;gap:6px;min-width:0">
        ${dot}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${ns}">${task.name||'<span style="color:#C4C9D4;font-style:italic">Untitled</span>'}</span></span>`;
    }
    case 'status': {
      const c=STATUS_C[task.status]||'#ccc', l=STATUS_L[task.status]||task.status;
      return `<span style="display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;
        font-size:11px;font-weight:500;background:${c}1a;color:${c};white-space:nowrap">${l}</span>`;
    }
    case 'owner_id': {
      const p=people.find(x=>x.id===task.owner_id);
      return p
        ? `<span style="display:flex;align-items:center;gap:6px">${av(p)}<span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</span></span>`
        : '<span style="color:#C4C9D4;font-size:12px">—</span>';
    }
    case 'type': {
      const c=TYPE_COLOR[task.type]||'#6B7280';
      return `<span style="font-size:10px;font-weight:500;padding:2px 7px;border-radius:4px;
        background:${c}1a;color:${c};white-space:nowrap;text-transform:capitalize">${task.type}</span>`;
    }
    case 'start_date':
      return task.start_date
        ? `<span style="font-size:12px;font-family:monospace">${fmt(task.start_date)}</span>`
        : '<span style="color:#C4C9D4;font-size:12px">—</span>';
    case 'end_date': {
      const over=isOverdue(task);
      return task.end_date
        ? `<span style="font-size:12px;font-family:monospace;color:${over?'#E24B4A':'inherit'}">${fmt(task.end_date)}</span>`
        : '<span style="color:#C4C9D4;font-size:12px">—</span>';
    }
    case 'duration_days':
      return task.duration_days
        ? `<span style="font-size:12px;font-family:monospace">${task.duration_days}d</span>`
        : '<span style="color:#C4C9D4;font-size:12px">—</span>';
    case 'effort_min':
      return `<span style="font-size:12px;font-family:monospace">${effLabel(task.effort_min||0)}</span>`;
    case 'sprint_id': {
      const s=sprints.find(x=>x.id===task.sprint_id);
      return s
        ? `<span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name}</span>`
        : '<span style="color:#C4C9D4;font-size:12px">—</span>';
    }
    case 'progress': {
      const pct=task.progress||0;
      return `<span style="display:flex;align-items:center;gap:5px;width:100%">
        <span style="flex:1;height:4px;background:rgba(0,0,0,.08);border-radius:2px;overflow:hidden">
          <span style="display:block;height:100%;width:${pct}%;background:${task.status==='done'?'#1D9E75':'#534AB7'};border-radius:2px"></span>
        </span>
        <span style="font-size:11px;font-family:monospace;color:#9CA3AF;flex-shrink:0;min-width:28px;text-align:right">${pct}%</span>
      </span>`;
    }
    default: return '<span style="color:#C4C9D4">—</span>';
  }
}

// ── cell editor ─────────────────────────────────────────────────────────────
function makeEditor(colId, task, ctx, onSave, onEnter, onTabDir) {
  const { people, sprints } = ctx;
  const b = 'border:none;outline:none;width:100%;background:transparent;font-size:13px;font-family:inherit;color:#1A1A22;padding:0';

  if (colId === 'name' || colId === 'duration_days' || colId === 'progress') {
    const el = document.createElement('input');
    el.type  = colId === 'name' ? 'text' : 'number';
    el.value = task[colId] || '';
    if (colId === 'progress') { el.min = 0; el.max = 100; }
    if (colId === 'duration_days') el.min = 0;
    el.style.cssText = b;
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); onEnter(); }
      if (e.key === 'Tab')    { e.preventDefault(); onTabDir(e.shiftKey ? -1 : 1); }
      if (e.key === 'Escape') { e.preventDefault(); onSave(task[colId]); }
    });
    el.addEventListener('blur', () => onSave(colId==='name' ? el.value : (el.value ? +el.value : null)));
    return el;
  }

  if (colId === 'start_date' || colId === 'end_date') {
    const el = document.createElement('input');
    el.type  = 'date';
    el.value = task[colId] || '';
    el.style.cssText = b;
    el.addEventListener('change', () => onSave(el.value || null));
    el.addEventListener('keydown', e => {
      if (e.key === 'Tab')    { e.preventDefault(); onTabDir(e.shiftKey ? -1 : 1); }
      if (e.key === 'Escape') onSave(task[colId]);
    });
    el.addEventListener('blur', () => onSave(el.value || null));
    return el;
  }

  // all selects
  const el = document.createElement('select');
  el.style.cssText = b + ';cursor:pointer';

  if (colId === 'status') {
    STATUSES.forEach(s => { const o=document.createElement('option'); o.value=s; o.textContent=STATUS_L[s]; if(s===task.status)o.selected=true; el.appendChild(o); });
  } else if (colId === 'owner_id') {
    const blank=document.createElement('option'); blank.value=''; blank.textContent='Unassigned'; if(!task.owner_id)blank.selected=true; el.appendChild(blank);
    people.forEach(p => { const o=document.createElement('option'); o.value=p.id; o.textContent=p.name+(p.is_client?' (client)':''); if(p.id===task.owner_id)o.selected=true; el.appendChild(o); });
  } else if (colId === 'type') {
    TYPES.forEach(t => { const o=document.createElement('option'); o.value=t; o.textContent=t; if(t===task.type)o.selected=true; el.appendChild(o); });
  } else if (colId === 'effort_min') {
    EFFORT.forEach(([v,l]) => { const o=document.createElement('option'); o.value=v; o.textContent=l; if(v===task.effort_min)o.selected=true; el.appendChild(o); });
  } else if (colId === 'sprint_id') {
    const blank=document.createElement('option'); blank.value=''; blank.textContent='Backlog'; if(!task.sprint_id)blank.selected=true; el.appendChild(blank);
    sprints.forEach(s => { const o=document.createElement('option'); o.value=s.id; o.textContent=s.name; if(s.id===task.sprint_id)o.selected=true; el.appendChild(o); });
  }

  el.addEventListener('change', () => onSave(el.value || null));
  el.addEventListener('blur',   () => onSave(el.value || null));
  el.addEventListener('keydown', e => { if(e.key==='Escape')onSave(task[colId]); });
  return el;
}

// ── date rollup ─────────────────────────────────────────────────────────────
// Walks UP the parent chain. Called after any date change or indent/outdent.
function rollupParentDates(parentId, db, allTasks) {
  if (!parentId) return;
  const parent   = db.get('tasks', parentId);
  if (!parent) return;
  const children = allTasks.filter(t => t.parent_id === parentId);
  if (!children.length) return;

  const starts = children.map(c => c.start_date).filter(Boolean).sort();
  const ends   = children.map(c => c.end_date).filter(Boolean).sort();

  if (starts.length || ends.length) {
    db.update('tasks', parentId, {
      start_date: starts[0]               || parent.start_date,
      end_date:   ends[ends.length - 1]   || parent.end_date,
    });
  }
  rollupParentDates(parent.parent_id, db, allTasks);
}

// ── indent / outdent ─────────────────────────────────────────────────────────
function indentTask(taskId, db, allTasks, onRerender) {
  const task   = db.get('tasks', taskId);
  if (!task) return;
  const sorted = allTasks
    .filter(t => t.project_id === task.project_id)
    .sort((a, b) => (a.sort_order||0) - (b.sort_order||0));
  const idx  = sorted.findIndex(t => t.id === taskId);
  const above = idx > 0 ? sorted[idx - 1] : null;
  if (above && above.id !== task.parent_id) {
    db.update('tasks', taskId, { parent_id: above.id });
    rollupParentDates(above.id, db, db.all('tasks').filter(t=>t.project_id===task.project_id));
    onRerender();
  }
}

function outdentTask(taskId, db, allTasks, onRerender) {
  const task = db.get('tasks', taskId);
  if (!task || !task.parent_id) return;
  const oldParent = db.get('tasks', task.parent_id);
  const newParent = oldParent?.parent_id || null;
  db.update('tasks', taskId, { parent_id: newParent });
  // update old parent's dates (may have lost a child)
  rollupParentDates(task.parent_id, db, db.all('tasks').filter(t=>t.project_id===task.project_id));
  onRerender();
}

// ── row HTML ─────────────────────────────────────────────────────────────────
function rowHTML(task, indent, ctx) {
  const bg = task.type==='phase'       ? 'rgba(83,74,183,.04)'    :
             task.type==='deliverable' ? 'rgba(29,158,117,.03)'   :
             task.type==='milestone'   ? 'rgba(186,117,23,.03)'   : '#fff';
  const strip = task.type==='phase'       ? '#534AB7' :
                task.type==='deliverable' ? '#1D9E75' :
                task.type==='milestone'   ? '#BA7517' : 'transparent';

  const cells = G.cols.map(colId => {
    const w = G.widths[colId];
    const indent_px = colId === 'name' ? 14 + indent * 20 : 10;
    const left_strip = colId === 'name'
      ? `<span style="position:absolute;left:0;top:0;bottom:0;width:3px;background:${strip}"></span>` : '';
    const drag_handle = colId === 'name'
      ? `<span class="row-drag" style="opacity:0;cursor:grab;color:#D1D5DB;margin-right:5px;font-size:12px;flex-shrink:0;user-select:none">⠿</span>` : '';
    return `<td class="g-cell" data-id="${task.id}" data-col="${colId}"
        style="position:relative;height:36px;padding:0;border-bottom:1px solid rgba(0,0,0,.05);
               border-right:1px solid rgba(0,0,0,.04);width:${w}px;min-width:${w}px;max-width:${w}px;overflow:hidden">
      ${left_strip}
      <div class="g-cell-inner" style="display:flex;align-items:center;padding:0 10px 0 ${indent_px}px;
           height:100%;gap:4px;overflow:hidden;min-width:0;cursor:text">
        ${drag_handle}${cellDisplay(colId, task, ctx)}
      </div>
    </td>`;
  }).join('');

  return `<tr class="g-row" data-id="${task.id}" style="background:${bg}">${cells}
    <td style="border-bottom:1px solid rgba(0,0,0,.05);width:auto"></td></tr>`;
}

// ── group header ──────────────────────────────────────────────────────────────
function groupHeaderHTML(label, count, color='#1D9E75') {
  return `<tr class="g-group-hd">
    <td colspan="${G.cols.length+1}" style="padding:0">
      <div style="display:flex;align-items:center;gap:8px;padding:10px 14px 8px;background:rgba(0,0,0,.02);
                  border-bottom:1px solid rgba(0,0,0,.06)">
        <span style="font-size:11px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:.05em">${label}</span>
        <span style="font-size:10px;color:#9CA3AF;background:rgba(0,0,0,.06);padding:1px 7px;border-radius:10px">${count}</span>
      </div>
    </td>
  </tr>`;
}

function addRowHTML(groupKey) {
  return `<tr class="g-add-row" data-group="${groupKey}" style="cursor:pointer">
    <td colspan="${G.cols.length+1}" style="padding:6px 14px 8px;border-bottom:1px solid rgba(0,0,0,.04)">
      <span style="font-size:12px;color:#C4C9D4;display:flex;align-items:center;gap:5px;user-select:none">
        <i class="ti ti-plus" style="font-size:11px"></i>Add task</span>
    </td>
  </tr>`;
}

// ── MAIN EXPORT ──────────────────────────────────────────────────────────────
export function renderGrid({ mount, tasks, people, deliverables, sprints, db, projectId, onSelect, onRerender }) {
  const ctx = { people, deliverables, sprints };

  // ── build flat rows respecting parent-child ────────────────────────────
  function collectRows(taskId, indent) {
    const t = tasks.find(x => x.id === taskId);
    if (!t) return [];
    const children = tasks.filter(x => x.parent_id === taskId)
      .sort((a, b) => (a.sort_order||0) - (b.sort_order||0));
    return [{ task:t, indent }, ...children.flatMap(c => collectRows(c.id, indent+1))];
  }

  // ── group by deliverable ───────────────────────────────────────────────
  const groups = new Map();
  deliverables
    .sort((a,b) => (a.sort_order||0) - (b.sort_order||0))
    .forEach(d => groups.set(d.id, { label:d.name, rows:[] }));
  groups.set('__none', { label:'No deliverable', rows:[] });

  tasks.filter(t => !t.parent_id)
    .sort((a,b) => (a.sort_order||0) - (b.sort_order||0))
    .forEach(t => {
      const key = (t.deliverable_id && groups.has(t.deliverable_id)) ? t.deliverable_id : '__none';
      groups.get(key).rows.push(...collectRows(t.id, 0));
    });

  // ── header ────────────────────────────────────────────────────────────
  const ths = G.cols.map(colId => {
    const col = ALL_COLS.find(c=>c.id===colId)||{label:colId};
    return `<th class="g-col-hd" data-col="${colId}" draggable="true"
      style="position:sticky;top:0;z-index:2;background:#F0F1F4;text-align:left;vertical-align:middle;
             border-bottom:1px solid rgba(0,0,0,.1);border-right:1px solid rgba(0,0,0,.06);
             padding:0 10px;height:30px;font-size:10px;font-weight:600;color:#9CA3AF;
             text-transform:uppercase;letter-spacing:.05em;
             width:${G.widths[colId]}px;min-width:${G.widths[colId]}px;white-space:nowrap;cursor:grab;user-select:none">
      ${col.label}
      <span class="col-resize" data-col="${colId}"
        style="position:absolute;right:0;top:0;bottom:0;width:5px;cursor:col-resize;z-index:3;
               background:transparent"></span>
    </th>`;
  }).join('');

  // ── body ──────────────────────────────────────────────────────────────
  let bodyHTML = '';
  groups.forEach((group, key) => {
    if (!group.rows.length && key !== '__none') return;
    const dl     = key !== '__none' ? deliverables.find(d=>d.id===key) : null;
    const color  = dl ? '#1D9E75' : '#9CA3AF';
    bodyHTML += groupHeaderHTML(group.label, group.rows.length, color);
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
      <div id="gCtx" style="display:none;position:absolute;background:#fff;border:.5px solid rgba(0,0,0,.12);
        border-radius:9px;box-shadow:0 4px 20px rgba(0,0,0,.14);z-index:200;min-width:200px;padding:4px 0"></div>
    </div>`;

  const table = mount.querySelector('#gTable');
  const scroll= mount.querySelector('#gScroll');
  const ctxEl = mount.querySelector('#gCtx');

  // ── inline cell editing ────────────────────────────────────────────────
  let activeCell = null;

  function deactivate() {
    if (!activeCell) return;
    const td = activeCell;
    activeCell = null;
    td.classList.remove('g-editing');
    const task = db.get('tasks', td.dataset.id);
    if (task) {
      td.querySelector('.g-cell-inner').innerHTML =
        cellDisplay(td.dataset.col, task, ctx);
    }
  }

  function activate(td) {
    if (activeCell === td) return;
    deactivate();
    const taskId = td.dataset.id, colId = td.dataset.col;
    const task   = db.get('tasks', taskId);
    if (!task) return;
    activeCell = td;
    td.classList.add('g-editing');
    const inner = td.querySelector('.g-cell-inner');
    const indentPx = colId === 'name' ? 14 + (parseInt(td.closest('[data-indent]')?.dataset.indent||0)) * 20 : 10;

    const onSave = value => {
      const patch = { [colId]: value };
      if (colId === 'progress' && value >= 100) patch.status = 'done';
      db.update('tasks', taskId, patch);
      // date rollup when a child date changes
      if ((colId === 'start_date' || colId === 'end_date') && task.parent_id) {
        rollupParentDates(task.parent_id, db, db.all('tasks').filter(t=>t.project_id===task.project_id));
      }
      const updated = db.get('tasks', taskId);
      if (inner && !activeCell) inner.innerHTML = cellDisplay(colId, updated, ctx);
      td.classList.remove('g-editing');
    };

    const onEnter = () => {
      const val = inner.querySelector('input,select')?.value;
      if (val !== undefined) db.update('tasks', taskId, { [colId]: val || null });
      deactivate();
      // insert row below
      const newTask = db.insert('tasks', {
        project_id: task.project_id, type:'task', name:'', status:'todo',
        parent_id: task.parent_id||null, deliverable_id: task.deliverable_id||null,
        sprint_id: task.sprint_id||null, effort_min:0, priority:'normal',
        progress:0, flagged:false, sort_order: (task.sort_order||0) + 0.5,
      });
      onRerender(() => {
        const newTd = table.querySelector(`td[data-id="${newTask.id}"][data-col="name"]`);
        if (newTd) activate(newTd);
      });
    };

    const onTabDir = dir => {
      const val = inner.querySelector('input,select')?.value;
      if (val !== undefined) db.update('tasks', taskId, { [colId]: val || null });
      deactivate();
      if (dir === 1  && colId === 'name') { indentTask(taskId, db, db.all('tasks').filter(t=>t.project_id===task.project_id), onRerender); return; }
      if (dir === -1 && colId === 'name') { outdentTask(taskId, db, db.all('tasks').filter(t=>t.project_id===task.project_id), onRerender); return; }
      // move to next/prev col
      const ci = G.cols.indexOf(colId);
      const next = G.cols[ci + dir];
      if (next) {
        const nextTd = table.querySelector(`td[data-id="${taskId}"][data-col="${next}"]`);
        if (nextTd) { requestAnimationFrame(() => activate(nextTd)); }
      }
    };

    inner.innerHTML = '';
    if (colId === 'name') {
      const handle = document.createElement('span');
      handle.className = 'row-drag';
      handle.style.cssText = 'opacity:0;cursor:grab;color:#D1D5DB;margin-right:5px;font-size:12px;flex-shrink:0;user-select:none';
      handle.textContent = '⠿';
      inner.appendChild(handle);
    }
    const editor = makeEditor(colId, task, ctx, onSave, onEnter, onTabDir);
    inner.appendChild(editor);
    editor.focus?.();
    if (editor.select) editor.select();
  }

  // click to edit
  table.addEventListener('mousedown', e => {
    if (e.target.closest('.col-resize') || e.target.closest('#gCtx')) return;
    const td = e.target.closest('.g-cell');
    if (td) { e.preventDefault(); activate(td); }
    else deactivate();
  });

  // hover → show drag handle
  table.addEventListener('mouseover', e => {
    const row = e.target.closest('.g-row');
    if (row) row.querySelectorAll('.row-drag').forEach(h=>h.style.opacity='1');
  });
  table.addEventListener('mouseout', e => {
    const row = e.target.closest('.g-row');
    if (row && !row.matches(':hover')) row.querySelectorAll('.row-drag').forEach(h=>h.style.opacity='0');
  });

  // + Add task row
  table.addEventListener('click', e => {
    const addRow = e.target.closest('.g-add-row');
    if (!addRow) return;
    deactivate();
    const groupKey = addRow.dataset.group;
    const dl = groupKey !== '__none' ? deliverables.find(d=>d.id===groupKey) : null;
    const newTask = db.insert('tasks', {
      project_id:projectId, type:'task', name:'', status:'todo',
      deliverable_id:dl?.id||null, progress:0, effort_min:0,
      priority:'normal', flagged:false, sort_order:Date.now(),
    });
    onRerender(() => {
      const td = table.querySelector(`td[data-id="${newTask.id}"][data-col="name"]`);
      if (td) activate(td);
    });
  });

  // ── right-click context menu ─────────────────────────────────────────────
  function hideCtx() { ctxEl.style.display='none'; }

  table.addEventListener('contextmenu', e => {
    const row = e.target.closest('.g-row');
    if (!row) return;
    e.preventDefault();
    deactivate();
    const taskId = row.dataset.id;
    const task   = db.get('tasks', taskId);
    if (!task) return;

    const allTasks = db.all('tasks').filter(t=>t.project_id===projectId);
    const sorted   = [...allTasks].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    const idx      = sorted.findIndex(t=>t.id===taskId);
    const above    = idx > 0 ? sorted[idx-1] : null;

    const menuItems = [
      // ── type change ──
      { label:`<i class="ti ti-subtask"></i> Mark as <b>task</b>`,        action:()=>{ db.update('tasks',taskId,{type:'task'});        onRerender(); hideCtx(); }, dim:task.type==='task' },
      { label:`<i class="ti ti-package"></i> Mark as <b>deliverable</b>`, action:()=>{ db.update('tasks',taskId,{type:'deliverable'}); onRerender(); hideCtx(); }, dim:task.type==='deliverable' },
      { label:`<i class="ti ti-diamond"></i> Mark as <b>milestone</b>`,   action:()=>{ db.update('tasks',taskId,{type:'milestone'});   onRerender(); hideCtx(); }, dim:task.type==='milestone' },
      null,
      // ── structure ──
      { label:`<i class="ti ti-plus"></i> Insert row above`,        action:()=>{ const t=db.insert('tasks',{project_id:projectId,type:'task',name:'',status:'todo',parent_id:task.parent_id||null,deliverable_id:task.deliverable_id||null,effort_min:0,priority:'normal',progress:0,flagged:false,sort_order:(task.sort_order||1)-0.5}); onRerender(()=>{const td2=table.querySelector(`td[data-id="${t.id}"][data-col="name"]`);if(td2)activate(td2);}); hideCtx(); }},
      { label:`<i class="ti ti-plus"></i> Insert row below`,        action:()=>{ const t=db.insert('tasks',{project_id:projectId,type:'task',name:'',status:'todo',parent_id:task.parent_id||null,deliverable_id:task.deliverable_id||null,effort_min:0,priority:'normal',progress:0,flagged:false,sort_order:(task.sort_order||0)+0.5}); onRerender(()=>{const td2=table.querySelector(`td[data-id="${t.id}"][data-col="name"]`);if(td2)activate(td2);}); hideCtx(); }},
      null,
      { label:`<i class="ti ti-arrow-right"></i> Indent → make child of row above`, action:()=>{ indentTask(taskId,db,allTasks,onRerender); hideCtx(); }, disabled:!above },
      { label:`<i class="ti ti-arrow-left"></i> Outdent → promote to parent level`, action:()=>{ outdentTask(taskId,db,allTasks,onRerender); hideCtx(); }, disabled:!task.parent_id },
      null,
      { label:`<i class="ti ti-message-circle"></i> ${task.flagged?'Remove from agenda':'Flag for next meeting'}`, action:()=>{ db.update('tasks',taskId,{flagged:!task.flagged}); onRerender(); hideCtx(); }},
      null,
      { label:`<i class="ti ti-trash" style="color:#E24B4A"></i> <span style="color:#E24B4A">Delete task</span>`, action:()=>{ if(confirm(`Delete "${task.name}"?`)){ db.remove('tasks',taskId); onRerender(); } hideCtx(); }},
    ];

    const rect = scroll.getBoundingClientRect();
    ctxEl.innerHTML = menuItems.map(item => item === null
      ? '<div style="height:1px;background:rgba(0,0,0,.07);margin:3px 0"></div>'
      : `<div class="ctx-item" style="padding:7px 14px;font-size:12.5px;cursor:${item.disabled?'default':'pointer'};
           display:flex;align-items:center;gap:8px;color:${item.disabled?'#C4C9D4':item.dim?'#534AB7':'#1A1A22'};
           ${item.dim?'background:rgba(83,74,183,.06)':''}">${item.label}</div>`
    ).join('');

    ctxEl.style.cssText=`display:block;position:absolute;left:${e.clientX-rect.left+scroll.scrollLeft}px;
      top:${e.clientY-rect.top+scroll.scrollTop}px;background:#fff;border:.5px solid rgba(0,0,0,.12);
      border-radius:9px;box-shadow:0 4px 20px rgba(0,0,0,.14);z-index:200;min-width:210px;padding:4px 0`;

    let realIdx = 0;
    ctxEl.querySelectorAll('.ctx-item').forEach(el => {
      while (menuItems[realIdx] === null) realIdx++;
      const item = menuItems[realIdx++];
      if (!item.disabled) {
        el.addEventListener('click', item.action);
        el.addEventListener('mouseover', () => { if(!item.dim) el.style.background='rgba(83,74,183,.06)'; });
        el.addEventListener('mouseout',  () => { if(!item.dim) el.style.background=''; });
      }
    });
  });

  document.addEventListener('mousedown', e => { if(!e.target.closest('#gCtx')) hideCtx(); });

  // ── column drag to reorder ────────────────────────────────────────────────
  mount.querySelectorAll('.g-col-hd').forEach(th => {
    th.addEventListener('dragstart', e => { G.dragCol = th.dataset.col; e.dataTransfer.effectAllowed='move'; });
    th.addEventListener('dragover',  e => { e.preventDefault(); th.classList.add('drag-over'); G.dragOverCol = th.dataset.col; });
    th.addEventListener('dragleave', ()=> th.classList.remove('drag-over'));
    th.addEventListener('drop', () => {
      th.classList.remove('drag-over');
      if (G.dragCol && G.dragOverCol && G.dragCol !== G.dragOverCol) {
        const from = G.cols.indexOf(G.dragCol);
        const to   = G.cols.indexOf(G.dragOverCol);
        if (from >= 0 && to >= 0 && !ALL_COLS.find(c=>c.id===G.dragCol)?.fixed) {
          G.cols.splice(from, 1);
          G.cols.splice(to, 0, G.dragCol);
          onRerender();
        }
      }
      G.dragCol = null; G.dragOverCol = null;
    });
  });

  // ── column resize ─────────────────────────────────────────────────────────
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
