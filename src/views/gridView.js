// gridView.js — hierarchical spreadsheet grid.
// Works over any parent-linked table via a `spec` object that describes the
// data source (columns, cell renderers, row styling, rollup, grouping, new-row
// defaults, and context-menu entries). The generic engine — selection, drag-
// and-drop, right-click menu, column resize/reorder/hide, wrap toggle, chevron
// collapse, indent/outdent, bulk action bar — knows nothing about tasks vs
// template rows.
//
// Two thin entrypoints wire specific specs to the engine:
//   renderGrid(props)         — project plan (SPEC_TASKS)
//   renderTemplateGrid(props) — template editor (SPEC_TEMPLATE_TASKS)

// ═══════════════════════════════════════════════════════════════════════════
// SPEC: TASKS (project plan)
// ═══════════════════════════════════════════════════════════════════════════

const STATUSES = [['todo','To do'],['in-progress','In progress'],['blocked','Blocked'],['review','Review'],['done','Done']];
const TYPES_TASKS = [['task','Task'],['deliverable','Deliverable'],['milestone','Milestone'],['phase','Phase'],['meeting','Meeting'],['action','Action'],['followup','Follow-up']];
const EFFORT   = [[0,'—'],[15,'15m'],[30,'30m'],[60,'1h'],[120,'2h'],[240,'4h'],[480,'1d'],[960,'2d'],[2400,'1w']];

const BASE_INPUT = 'border:0;outline:0;background:transparent;font-family:inherit;font-size:13px;color:#1A1A22;width:100%;height:100%;padding:0;cursor:pointer';

const SPEC_TASKS = {
  table: 'tasks',
  prefsKey: 'planr_grid_prefs_v1',

  columns: [
    { id:'name', label:'Task', w:340, cellHTML: cellName_Tasks },
    { id:'status', label:'Status', w:130, cellHTML: cellStatus_Tasks, rollup:true },
    { id:'owner_id', label:'Owner', w:150, cellHTML: cellOwner_Tasks },
    { id:'type', label:'Type', w:120, cellHTML: cellType_Tasks },
    { id:'start_date', label:'Start', w:130, cellHTML: cellDate_Tasks('start_date'), rollup:true },
    { id:'end_date', label:'Due', w:130, cellHTML: cellDate_Tasks('end_date'), rollup:true },
    { id:'effort_min', label:'Effort', w:100, cellHTML: cellEffort_Tasks, rollup:true },
    { id:'sprint_id', label:'Sprint', w:140, cellHTML: cellSprint_Tasks },
    { id:'progress', label:'%', w:80, cellHTML: cellProgress_Tasks, rollup:true },
  ],

  getRowStyle(record, isSelected) {
    const bg = isSelected                    ? 'rgba(83,74,183,.08)'  :
               record.type === 'phase'       ? 'rgba(83,74,183,.04)'  :
               record.type === 'deliverable' ? 'rgba(29,158,117,.03)' :
               record.type === 'milestone'   ? 'rgba(186,117,23,.03)' : '#fff';
    const strip = record.type === 'phase'    ? '#534AB7' :
                  record.type === 'deliverable' ? '#1D9E75' :
                  record.type === 'milestone'   ? '#BA7517' : 'transparent';
    return { bg, strip };
  },

  // Group top-level (parentless) records by their deliverable_id.
  groupBy(records, ctx) {
    const groups = new Map();
    [...ctx.deliverables].sort((a,b) => (a.sort_order||0)-(b.sort_order||0))
      .forEach(d => groups.set(d.id, { label: d.name, color: '#1D9E75', rows: [], addLabel: 'Add task' }));
    groups.set('__none', { label: 'No deliverable', color: '#9CA3AF', rows: [], addLabel: 'Add task' });
    records.filter(t => !t.parent_id)
      .sort((a,b) => (a.sort_order||0)-(b.sort_order||0))
      .forEach(t => {
        const key = (t.deliverable_id && groups.has(t.deliverable_id)) ? t.deliverable_id : '__none';
        groups.get(key).rows.push(t);
      });
    return groups;
  },

  newRow(ctx, extras = {}) {
    return {
      project_id: ctx.projectId, type: 'task', name: '', status: 'todo',
      deliverable_id: extras.deliverable_id || null,
      parent_id: extras.parent_id || null,
      sprint_id: extras.sprint_id || null,
      effort_min: 0, priority: 'normal', progress: 0, flagged: false,
      ...extras,
    };
  },

  contextTypeItems(record, ctx, db, onRerender, hideCtx) {
    const set = t => () => { db.update('tasks', record.id, { type: t }); onRerender(); hideCtx(); };
    return [
      { label:'<i class="ti ti-subtask"></i> Mark as <b>task</b>',        dim: record.type==='task',        action: set('task') },
      { label:'<i class="ti ti-package"></i> Mark as <b>deliverable</b>', dim: record.type==='deliverable', action: set('deliverable') },
      { label:'<i class="ti ti-diamond"></i> Mark as <b>milestone</b>',   dim: record.type==='milestone',   action: set('milestone') },
    ];
  },

  contextExtraItems(record, ctx, db, onRerender, hideCtx) {
    return [
      { label:`<i class="ti ti-message-circle"></i> ${record.flagged ? 'Remove from agenda' : 'Flag for meeting'}`,
        action: () => { db.update('tasks', record.id, { flagged: !record.flagged }); onRerender(); hideCtx(); } },
    ];
  },

  onChange(record, patch, ctx, db, onRerender) {
    if ('progress' in patch) {
      if (patch.progress != null && patch.progress >= 100)          db.update('tasks', record.id, { status: 'done' });
      else if (patch.progress != null && patch.progress < 100 && record.status === 'done')
        db.update('tasks', record.id, { status: 'in-progress' });
    }
    if (patch.type === 'meeting') {
      const existing = db.all('meetings').find(m => m.linked_task_id === record.id);
      if (!existing) {
        db.insert('meetings', {
          project_id: ctx.projectId,
          title: record.name || 'New meeting',
          date: record.start_date || new Date().toISOString().slice(0, 10),
          start_time: '09:00', duration_min: 55, notes: null,
          linked_task_id: record.id,
        });
      }
    }
    if (record.type === 'meeting' || patch.type === 'meeting') {
      const linked = db.all('meetings').find(m => m.linked_task_id === record.id);
      if (linked) {
        const mp = {};
        if ('name'       in patch) mp.title = patch.name || 'Untitled meeting';
        if ('start_date' in patch) mp.date  = patch.start_date || new Date().toISOString().slice(0, 10);
        if (Object.keys(mp).length) db.update('meetings', linked.id, mp);
      }
    }
  },

  rollup(parentId, ctx, db, records) {
    if (!parentId) return;
    const parent = db.get('tasks', parentId);
    if (!parent) return;
    const children = records.filter(t => t.parent_id === parentId);
    if (!children.length) return;

    const starts  = children.map(c => c.start_date).filter(Boolean).sort();
    const ends    = children.map(c => c.end_date).filter(Boolean).sort();
    const efforts = children.map(c => c.effort_min || 0);
    const progs   = children.map(c => c.progress || 0);

    const statuses = children.map(c => c.status);
    let newStatus;
    if (statuses.includes('blocked'))       newStatus = 'blocked';
    else if (statuses.includes('in-progress')) newStatus = 'in-progress';
    else if (statuses.includes('review'))   newStatus = 'review';
    else if (statuses.every(s => s === 'done')) newStatus = 'done';
    else newStatus = 'todo';

    const patch = {
      effort_min: efforts.reduce((a,b) => a+b, 0),
      progress:   Math.round(progs.reduce((a,b) => a+b, 0) / children.length),
    };
    if (starts.length) patch.start_date = starts[0];
    if (ends.length)   patch.end_date   = ends[ends.length - 1];
    if (newStatus)     patch.status     = newStatus;

    db.update('tasks', parentId, patch);
    SPEC_TASKS.rollup(parent.parent_id, ctx, db, records);
  },

  supportsOpen: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// SPEC: TEMPLATE_TASKS (template editor)
// ═══════════════════════════════════════════════════════════════════════════

const SPEC_TEMPLATE_TASKS = {
  table: 'template_tasks',
  prefsKey: 'planr_template_grid_prefs_v1',

  columns: [
    { id:'wbs',                   label:'WBS',              w:70,  cellHTML: cellWBS_Template },
    { id:'name',                  label:'Task / Deliverable', w:360, cellHTML: cellName_Template },
    { id:'workstream',            label:'Workstream',       w:130, cellHTML: cellText_Template('workstream') },
    { id:'owner_role',            label:'Owner role',       w:130, cellHTML: cellText_Template('owner_role', 'e.g. Project Manager') },
    { id:'accountable_role',      label:'Accountable',      w:130, cellHTML: cellText_Template('accountable_role') },
    { id:'duration_workdays',     label:'Dur',              w:56,  cellHTML: cellNumber_Template('duration_workdays') },
    { id:'start_offset_workdays', label:'Off',              w:56,  cellHTML: cellNumber_Template('start_offset_workdays') },
    { id:'predecessor_wbs',       label:'Depends on',       w:110, cellHTML: cellText_Template('predecessor_wbs') },
    { id:'acceptance_criteria',   label:'Acceptance',       w:220, cellHTML: cellText_Template('acceptance_criteria', 'What does done look like?') },
    { id:'key_dependency',        label:'Key dependency',   w:150, cellHTML: cellText_Template('key_dependency') },
  ],

  getRowStyle(record, isSelected) {
    const bg = isSelected                    ? 'rgba(83,74,183,.08)'  :
               record.type === 'phase'       ? 'rgba(83,74,183,.04)'  :
               record.type === 'deliverable' ? 'rgba(29,158,117,.03)' :
               record.type === 'milestone'   ? 'rgba(186,117,23,.03)' : '#fff';
    const strip = record.type === 'phase'    ? '#534AB7' :
                  record.type === 'deliverable' ? '#1D9E75' :
                  record.type === 'milestone'   ? '#BA7517' : 'transparent';
    return { bg, strip };
  },

  // No deliverable grouping — a single implicit group holds all top-level rows.
  // Phases render as top-level rows and their children hang beneath them.
  groupBy(records) {
    return new Map([['__all', {
      label: null, color: null,
      rows: records.filter(r => !r.parent_id).sort((a,b) => (a.sort_order||0)-(b.sort_order||0)),
      addLabel: 'Add phase',
    }]]);
  },

  newRow(ctx, extras = {}) {
    return {
      template_id: ctx.templateId,
      type: extras.type || 'task',
      name: '',
      duration_workdays: 1,
      start_offset_workdays: 0,
      is_milestone: false,
      ...extras,
    };
  },

  contextTypeItems(record, ctx, db, onRerender, hideCtx) {
    const set = t => () => {
      const patch = { type: t, is_milestone: t === 'milestone' };
      db.update('template_tasks', record.id, patch);
      onRerender(); hideCtx();
    };
    return [
      { label:'<i class="ti ti-subtask"></i> Mark as <b>task</b>',        dim: record.type==='task',        action: set('task') },
      { label:'<i class="ti ti-diamond-filled"></i> Mark as <b>milestone</b>', dim: record.type==='milestone', action: set('milestone') },
      { label:'<i class="ti ti-folder"></i> Mark as <b>phase</b>',        dim: record.type==='phase',       action: set('phase') },
      { label:'<i class="ti ti-package"></i> Mark as <b>deliverable</b>', dim: record.type==='deliverable', action: set('deliverable') },
    ];
  },

  contextExtraItems() { return []; },
  onChange() { /* no side-effects */ },
  rollup: null,
  supportsOpen: false,
};

// ═══════════════════════════════════════════════════════════════════════════
// CELL RENDERERS: TASKS
// ═══════════════════════════════════════════════════════════════════════════

function cellName_Tasks(record, ctx, isLocked, hasChildren, isCollapsed) {
  const bold = record.type === 'phase'       ? 'font-weight:600;color:#3C3489' :
               record.type === 'deliverable' ? 'font-weight:500;color:#0F6E56' :
               record.type === 'milestone'   ? 'font-weight:500;color:#854F0B' : '';
  return nameCellFrame(record, hasChildren, isCollapsed, bold, ctx, 'Untitled task');
}

function cellStatus_Tasks(record, ctx, isLocked) {
  const opts = STATUSES.map(([v,l]) => `<option value="${v}" ${v===record.status?'selected':''}>${l}</option>`).join('');
  return `<select class="g-in" data-id="${record.id}" data-col="status" ${isLocked?'disabled':''} style="${BASE_INPUT};${lockStyle(isLocked)}">${opts}</select>`;
}

function cellOwner_Tasks(record, ctx) {
  const blank = `<option value="" ${!record.owner_id?'selected':''}>Unassigned</option>`;
  const opts  = ctx.people.map(p => `<option value="${p.id}" ${p.id===record.owner_id?'selected':''}>${escapeHtml(p.name)}${p.is_client?' (client)':''}</option>`).join('');
  const addNew = `<option value="__add_person__" style="font-style:italic">+ Add person…</option>`;
  return `<select class="g-in" data-id="${record.id}" data-col="owner_id" style="${BASE_INPUT}">${blank}${opts}${addNew}</select>`;
}

function cellType_Tasks(record) {
  const opts = TYPES_TASKS.map(([v,l]) => `<option value="${v}" ${v===record.type?'selected':''}>${l}</option>`).join('');
  return `<select class="g-in" data-id="${record.id}" data-col="type" style="${BASE_INPUT}">${opts}</select>`;
}

function cellDate_Tasks(field) {
  return (record, ctx, isLocked) =>
    `<input type="date" class="g-in" data-id="${record.id}" data-col="${field}" ${isLocked?'disabled':''}
       value="${record[field]||''}" style="${BASE_INPUT};font-family:monospace;font-size:12px;${lockStyle(isLocked)}">`;
}

function cellEffort_Tasks(record, ctx, isLocked) {
  if (isLocked) {
    const label = EFFORT.find(([v]) => v === record.effort_min)?.[1] || (record.effort_min ? record.effort_min + 'm' : '—');
    return `<span title="Rolled up from children" style="font-size:12px;font-family:monospace;color:#6B7280;padding:0 4px">${label}</span>`;
  }
  const opts = EFFORT.map(([v,l]) => `<option value="${v}" ${v===record.effort_min?'selected':''}>${l}</option>`).join('');
  return `<select class="g-in" data-id="${record.id}" data-col="effort_min" style="${BASE_INPUT}">${opts}</select>`;
}

function cellSprint_Tasks(record, ctx) {
  const blank = `<option value="" ${!record.sprint_id?'selected':''}>Backlog</option>`;
  const opts  = ctx.sprints.map(s => `<option value="${s.id}" ${s.id===record.sprint_id?'selected':''}>${escapeHtml(s.name)}</option>`).join('');
  return `<select class="g-in" data-id="${record.id}" data-col="sprint_id" style="${BASE_INPUT}">${blank}${opts}</select>`;
}

function cellProgress_Tasks(record, ctx, isLocked) {
  return `<input type="number" class="g-in" data-id="${record.id}" data-col="progress" ${isLocked?'disabled':''}
    min="0" max="100" value="${record.progress||0}" style="${BASE_INPUT};text-align:right;font-family:monospace;font-size:12px;${lockStyle(isLocked)}">`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CELL RENDERERS: TEMPLATE_TASKS
// ═══════════════════════════════════════════════════════════════════════════

function cellWBS_Template(record) {
  const disabled = record.type === 'deliverable';
  return `<input type="text" class="g-in" data-id="${record.id}" data-col="wbs"
    value="${escapeAttr(record.wbs || '')}" ${disabled?'disabled':''}
    style="${BASE_INPUT};font-family:JetBrains Mono, monospace;font-size:11px${disabled?';color:#C4C9D4':''}">`;
}

function cellName_Template(record, ctx, isLocked, hasChildren, isCollapsed) {
  const bold = record.type === 'phase'       ? 'font-weight:600;color:#3C3489' :
               record.type === 'deliverable' ? 'font-weight:500;color:#0F6E56' :
               record.type === 'milestone'   ? 'font-weight:500;color:#854F0B' : '';
  const placeholder = record.type === 'phase' ? 'Phase name' :
                      record.type === 'deliverable' ? 'Deliverable name' : 'Task name';
  return nameCellFrame(record, hasChildren, isCollapsed, bold, ctx, placeholder);
}

function cellText_Template(field, placeholder = '') {
  return record => {
    if (record.type === 'phase' || record.type === 'deliverable') {
      return `<span style="color:#C4C9D4;font-size:11px"></span>`;
    }
    return `<input type="text" class="g-in" data-id="${record.id}" data-col="${field}"
      value="${escapeAttr(record[field] || '')}" placeholder="${escapeAttr(placeholder)}"
      style="${BASE_INPUT}">`;
  };
}

function cellNumber_Template(field) {
  return record => {
    if (record.type === 'phase' || record.type === 'deliverable') {
      return `<span style="color:#C4C9D4;font-size:11px"></span>`;
    }
    return `<input type="number" min="0" class="g-in" data-id="${record.id}" data-col="${field}"
      value="${record[field] ?? ''}"
      style="${BASE_INPUT};text-align:center;font-family:JetBrains Mono, monospace;font-size:11px">`;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared cell fragments
// ═══════════════════════════════════════════════════════════════════════════

function nameCellFrame(record, hasChildren, isCollapsed, extraStyle, ctx, placeholder) {
  const chevron = hasChildren
    ? `<span class="g-chev" data-id="${record.id}" style="cursor:pointer;color:#9CA3AF;
         font-size:10px;margin-right:2px;user-select:none;width:12px;flex-shrink:0;
         display:inline-flex;align-items:center;justify-content:center">${isCollapsed ? '▶' : '▼'}</span>`
    : `<span style="width:12px;flex-shrink:0"></span>`;
  const dragHandle = `<span class="g-drag" data-id="${record.id}" draggable="true"
    style="opacity:0;cursor:grab;color:#C4C9D4;font-size:14px;margin-right:4px;user-select:none;
           width:14px;flex-shrink:0;transition:opacity 100ms;line-height:1">⋮⋮</span>`;
  const openBtn = ctx.supportsOpen
    ? `<button class="g-open" data-id="${record.id}" title="Open details"
        style="opacity:0;background:transparent;border:0;padding:0;cursor:pointer;color:#9CA3AF;
               font-size:12px;margin-right:4px;user-select:none;width:16px;height:16px;
               display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;
               transition:opacity 100ms;border-radius:3px">
        <i class="ti ti-arrow-up-right" style="font-size:11px"></i>
      </button>`
    : '';

  // Type icon for phases/milestones/deliverables (matches column type).
  let typeIcon = '';
  if (record.type === 'phase') {
    typeIcon = `<i class="ti ti-folder" style="font-size:12px;color:#534AB7;margin-right:4px;flex-shrink:0"></i>`;
  } else if (record.type === 'milestone') {
    typeIcon = `<i class="ti ti-diamond-filled" style="font-size:12px;color:#BA7517;margin-right:4px;flex-shrink:0"></i>`;
  } else if (record.type === 'deliverable') {
    typeIcon = `<i class="ti ti-package" style="font-size:12px;color:#1D9E75;margin-right:4px;flex-shrink:0"></i>`;
  }

  if (ctx.wrap) {
    return `${chevron}${dragHandle}${openBtn}${typeIcon}<textarea class="g-in g-name-ta" data-id="${record.id}" data-col="name"
      placeholder="${placeholder}" rows="1"
      style="${BASE_INPUT};${extraStyle};cursor:text;resize:none;padding:2px 0;line-height:1.4;
             min-height:22px;overflow:hidden;white-space:pre-wrap;word-wrap:break-word">${escapeHtml(record.name||'')}</textarea>`;
  }
  return `${chevron}${dragHandle}${openBtn}${typeIcon}<input type="text" class="g-in" data-id="${record.id}" data-col="name"
    value="${escapeAttr(record.name||'')}" placeholder="${placeholder}"
    style="${BASE_INPUT};${extraStyle};cursor:text">`;
}

function lockStyle(isLocked) {
  return isLocked ? 'cursor:not-allowed;color:#6B7280;pointer-events:none;opacity:0.85' : '';
}

function escapeHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeAttr(s) { return escapeHtml(s).replace(/"/g,'&quot;'); }

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE — everything below is data-source-agnostic
// ═══════════════════════════════════════════════════════════════════════════

let _sortSeq = 1_000_000;
const nextSort = () => ++_sortSeq;

function rowHTML(record, indent, cols, widths, ctx, spec, hasChildren, isCollapsed, isSelected) {
  const { bg, strip } = spec.getRowStyle(record, isSelected);

  const checkCell = `<td class="g-check-cell" data-id="${record.id}"
    style="width:36px;min-width:36px;max-width:36px;padding:0;border-bottom:1px solid rgba(0,0,0,.06);
           border-right:1px solid rgba(0,0,0,.04);text-align:center;background:${bg};cursor:pointer">
    <input type="checkbox" class="g-check" data-id="${record.id}" ${isSelected?'checked':''}
      style="cursor:pointer;margin:0;accent-color:#534AB7">
  </td>`;

  const cells = cols.map(col => {
    const w   = widths[col.id];
    const ipl = col.id === 'name' ? 14 + indent*20 : 8;
    const stripEl = col.id === 'name'
      ? `<span style="position:absolute;left:0;top:0;bottom:0;width:3px;background:${strip}"></span>` : '';
    const cellH = ctx.wrap ? 'min-height:38px' : 'height:38px';
    const innerOverflow = ctx.wrap ? '' : 'overflow:hidden';
    const isLocked = hasChildren && col.rollup;
    return `<td class="g-cell" data-id="${record.id}" data-col="${col.id}"
      style="position:relative;${cellH};padding:0;border-bottom:1px solid rgba(0,0,0,.06);
             border-right:1px solid rgba(0,0,0,.04);width:${w}px;min-width:${w}px;max-width:${w}px;overflow:hidden;background:${bg};vertical-align:top">
      ${stripEl}
      <div class="g-inner" style="display:flex;align-items:${ctx.wrap?'flex-start':'center'};padding:${ctx.wrap?'8px':'0'} 8px 0 ${ipl}px;${ctx.wrap?'':'height:100%;'}${innerOverflow};gap:2px;${ctx.wrap?'min-height:38px':''}">
        ${col.cellHTML(record, ctx, isLocked, hasChildren, isCollapsed)}
      </div>
    </td>`;
  }).join('');
  return `<tr class="g-row" data-id="${record.id}">${checkCell}${cells}<td style="border-bottom:1px solid rgba(0,0,0,.06)"></td></tr>`;
}

function groupHeaderHTML(label, count, colspan, color='#1D9E75') {
  return `<tr class="g-group-hd"><td colspan="${colspan}" style="padding:0">
    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px 8px;background:rgba(0,0,0,.02);border-bottom:1px solid rgba(0,0,0,.06)">
      <span style="font-size:11px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:.05em">${escapeHtml(label)}</span>
      <span style="font-size:10px;color:#9CA3AF;background:rgba(0,0,0,.06);padding:1px 7px;border-radius:10px">${count}</span>
    </div>
  </td></tr>`;
}

function addRowHTML(groupKey, colspan, label) {
  return `<tr class="g-add-row" data-group="${groupKey}" style="cursor:pointer">
    <td colspan="${colspan}" style="padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.04)">
      <span style="font-size:12px;color:#9CA3AF;display:flex;align-items:center;gap:5px;user-select:none">
        <i class="ti ti-plus" style="font-size:11px"></i>${label}</span>
    </td>
  </tr>`;
}

// ─── indent / outdent ────────────────────────────────────────────────────────
function indentRow(recordId, spec, db, allRecords, onRerender, ctx) {
  const rec = db.get(spec.table, recordId);
  if (!rec) return;
  const sorted = [...allRecords].sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
  const idx = sorted.findIndex(t => t.id === recordId);
  const above = idx > 0 ? sorted[idx-1] : null;
  if (above && above.id !== rec.parent_id) {
    db.update(spec.table, recordId, { parent_id: above.id });
    if (spec.rollup) spec.rollup(above.id, ctx, db, allRecords);
    onRerender();
  }
}
function outdentRow(recordId, spec, db, allRecords, onRerender, ctx) {
  const rec = db.get(spec.table, recordId);
  if (!rec || !rec.parent_id) return;
  const oldParent = db.get(spec.table, rec.parent_id);
  db.update(spec.table, recordId, { parent_id: oldParent?.parent_id || null });
  if (spec.rollup) spec.rollup(rec.parent_id, ctx, db, allRecords);
  onRerender();
}

function bulkIndent(selectedIds, spec, db, allRecords, onRerender, ctx) {
  if (!selectedIds.size) return;
  const sorted = [...allRecords].sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
  const firstIdx = sorted.findIndex(t => selectedIds.has(t.id));
  if (firstIdx <= 0) return;
  const parent = sorted[firstIdx - 1];
  if (selectedIds.has(parent.id)) return;
  let cur = parent;
  while (cur && cur.parent_id) {
    if (selectedIds.has(cur.parent_id)) return;
    cur = db.get(spec.table, cur.parent_id);
  }
  selectedIds.forEach(id => db.update(spec.table, id, { parent_id: parent.id }));
  if (spec.rollup) spec.rollup(parent.id, ctx, db, allRecords);
  onRerender();
}
function bulkOutdent(selectedIds, spec, db, allRecords, onRerender, ctx) {
  if (!selectedIds.size) return;
  const touched = new Set();
  selectedIds.forEach(id => {
    const rec = db.get(spec.table, id);
    if (!rec || !rec.parent_id) return;
    const oldParent = db.get(spec.table, rec.parent_id);
    db.update(spec.table, id, { parent_id: oldParent?.parent_id || null });
    touched.add(rec.parent_id);
  });
  if (spec.rollup) touched.forEach(pid => spec.rollup(pid, ctx, db, allRecords));
  onRerender();
}
function bulkDelete(selectedIds, spec, db, onRerender) {
  selectedIds.forEach(id => db.remove(spec.table, id));
  onRerender();
}

function getDescendantIds(recordId, allRecords) {
  const ids = new Set();
  const stack = [recordId];
  while (stack.length) {
    const id = stack.pop();
    for (const t of allRecords) {
      if (t.parent_id === id && !ids.has(t.id)) { ids.add(t.id); stack.push(t.id); }
    }
  }
  return ids;
}

function moveRecordAbove(recordId, targetId, spec, db, allRecords, onRerender, ctx) {
  if (recordId === targetId) return;
  const desc = getDescendantIds(recordId, allRecords);
  if (desc.has(targetId)) return;
  const rec = db.get(spec.table, recordId);
  const target = db.get(spec.table, targetId);
  if (!rec || !target) return;

  const newParent = target.parent_id || null;
  const oldParent = rec.parent_id;

  const targetSort = target.sort_order || 0;
  const siblings = allRecords
    .filter(t => (t.parent_id||null) === (newParent||null))
    .sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
  const targetIdx = siblings.findIndex(s => s.id === targetId);
  const above = targetIdx > 0 ? siblings[targetIdx-1] : null;
  let newSort = above ? Math.floor(((above.sort_order||0) + targetSort) / 2) : targetSort - 100;

  if (newSort <= 0) {
    siblings.forEach(sib => {
      if (sib.id !== recordId) db.update(spec.table, sib.id, { sort_order: (sib.sort_order || 0) + 1000 });
    });
    const targetNow = db.get(spec.table, targetId);
    newSort = (targetNow.sort_order || 0) - 500;
  }
  db.update(spec.table, recordId, { parent_id: newParent, sort_order: newSort });

  if (spec.rollup) {
    if (oldParent) spec.rollup(oldParent, ctx, db, allRecords);
    if (newParent) spec.rollup(newParent, ctx, db, allRecords);
  }
  onRerender();
}

// ─── prefs (per-spec so tasks and templates have independent column state) ──
function loadPrefs(spec) {
  try {
    const raw = localStorage.getItem(spec.prefsKey);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const known = new Set(spec.columns.map(c => c.id));
    p.cols   = (p.cols || []).filter(c => known.has(c));
    spec.columns.forEach(c => { if (!p.cols.includes(c.id) && !(p.hidden || []).includes(c.id)) p.cols.push(c.id); });
    p.widths = p.widths || {};
    spec.columns.forEach(c => { if (!p.widths[c.id]) p.widths[c.id] = c.w; });
    p.hidden = new Set(p.hidden || []);
    p.wrap   = !!p.wrap;
    return p;
  } catch (e) { return null; }
}
function savePrefs(spec, G) {
  try {
    localStorage.setItem(spec.prefsKey, JSON.stringify({
      cols: G.cols, widths: G.widths, hidden: [...G.hidden], wrap: G.wrap,
    }));
  } catch (e) {}
}

// Per-spec runtime state. Keyed by prefsKey so tasks and templates keep their
// own selection/collapse/prefs across rerenders.
const _stateByKey = new Map();
function stateFor(spec) {
  if (_stateByKey.has(spec.prefsKey)) return _stateByKey.get(spec.prefsKey);
  const persisted = loadPrefs(spec);
  const state = {
    cols:      persisted?.cols   || spec.columns.map(c => c.id),
    widths:    persisted?.widths || Object.fromEntries(spec.columns.map(c => [c.id, c.w])),
    hidden:    persisted?.hidden || new Set(),
    wrap:      persisted?.wrap   ?? false,
    collapsed: new Set(),
    selected:  new Set(),
    lastClickedId: null,
  };
  _stateByKey.set(spec.prefsKey, state);
  return state;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENGINE
// ═══════════════════════════════════════════════════════════════════════════

function renderGridCore({ mount, records, ctx, spec, db, onSelect, onRerender }) {
  _sortSeq = Math.max(_sortSeq, ...records.map(r => r.sort_order || 0));
  const G = stateFor(spec);

  const childrenOf = new Map();
  records.forEach(r => {
    if (r.parent_id) {
      if (!childrenOf.has(r.parent_id)) childrenOf.set(r.parent_id, []);
      childrenOf.get(r.parent_id).push(r);
    }
  });

  // Rollup pass (deepest first) so parents reflect children.
  if (spec.rollup) {
    const parentIds = [...childrenOf.keys()];
    const depthOf = id => {
      let d = 0, cur = db.get(spec.table, id);
      while (cur && cur.parent_id) { d++; cur = db.get(spec.table, cur.parent_id); }
      return d;
    };
    parentIds.sort((a, b) => depthOf(b) - depthOf(a));
    parentIds.forEach(pid => spec.rollup(pid, ctx, db, records));
  }

  function collectRows(id, indent) {
    const t = records.find(x => x.id === id);
    if (!t) return [];
    const hasKids = childrenOf.has(id);
    const isCollapsed = G.collapsed.has(id);
    const rows = [{ record: t, indent, hasChildren: hasKids, isCollapsed }];
    if (!isCollapsed && hasKids) {
      const kids = [...childrenOf.get(id)].sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
      for (const c of kids) rows.push(...collectRows(c.id, indent + 1));
    }
    return rows;
  }

  const groups = spec.groupBy(records, ctx);
  groups.forEach((group) => {
    const roots = group.rows;
    group.rows = [];
    roots.forEach(root => { group.rows.push(...collectRows(root.id, 0)); });
  });

  ctx.wrap = G.wrap;
  ctx.supportsOpen = !!spec.supportsOpen;

  const cols = G.cols.map(id => spec.columns.find(c => c.id === id)).filter(c => c && !G.hidden.has(c.id));
  const colspan = cols.length + 2;

  const allVisibleSelected = records.length > 0 && records.every(t => G.selected.has(t.id));
  const checkTh = `<th style="position:sticky;top:0;z-index:2;background:#F0F1F4;
    border-bottom:1px solid rgba(0,0,0,.1);border-right:1px solid rgba(0,0,0,.06);
    width:36px;min-width:36px;padding:0;text-align:center;height:32px">
    <input type="checkbox" id="gCheckAll" ${allVisibleSelected?'checked':''}
      style="cursor:pointer;margin:0;accent-color:#534AB7"></th>`;

  const ths = cols.map(col => `<th data-col="${col.id}" draggable="true" class="g-th"
    style="position:sticky;top:0;z-index:2;background:#F0F1F4;text-align:left;
           border-bottom:1px solid rgba(0,0,0,.1);border-right:1px solid rgba(0,0,0,.06);
           padding:0 10px;height:32px;font-size:10px;font-weight:600;color:#9CA3AF;
           text-transform:uppercase;letter-spacing:.05em;width:${G.widths[col.id]}px;
           min-width:${G.widths[col.id]}px;white-space:nowrap;user-select:none;cursor:grab">
    <span style="pointer-events:none">${col.label}</span>
    <div class="g-th-resize" data-col="${col.id}"
      style="position:absolute;top:0;right:0;width:6px;height:100%;cursor:col-resize;
             background:transparent;z-index:3"
      onmouseover="this.style.background='rgba(83,74,183,.2)'"
      onmouseout="this.style.background='transparent'"></div>
  </th>`).join('');

  let bodyHTML = '';
  groups.forEach((group, key) => {
    if (!group.rows.length && key !== '__none' && key !== '__all') return;
    if (group.label !== null) bodyHTML += groupHeaderHTML(group.label, group.rows.length, colspan, group.color);
    group.rows.forEach(({ record, indent, hasChildren, isCollapsed }) => {
      const isSelected = G.selected.has(record.id);
      bodyHTML += rowHTML(record, indent, cols, G.widths, ctx, spec, hasChildren, isCollapsed, isSelected);
    });
    bodyHTML += addRowHTML(key, colspan, group.addLabel || 'Add row');
  });

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
        <colgroup><col style="width:36px">${cols.map(c => `<col style="width:${G.widths[c.id]}px">`).join('')}<col></colgroup>
        <thead><tr>${checkTh}${ths}<th style="background:#F0F1F4;border-bottom:1px solid rgba(0,0,0,.1)"></th></tr></thead>
        <tbody>${bodyHTML}</tbody>
      </table>
      <div id="gCtx" style="display:none;position:absolute;background:#fff;border:.5px solid rgba(0,0,0,.12);border-radius:9px;box-shadow:0 4px 20px rgba(0,0,0,.14);z-index:200;min-width:220px;padding:4px 0"></div>
    </div>`;

  const table  = mount.querySelector('#gTable');
  const scroll = mount.querySelector('#gScroll');
  const ctxEl  = mount.querySelector('#gCtx');

  scroll.scrollTop  = savedScrollTop;
  scroll.scrollLeft = savedScrollLeft;

  // ─── SELECTION ────────────────────────────────────────────────────────
  const getVisibleIds = () => [...table.querySelectorAll('.g-row')].map(r => r.dataset.id);
  const toggleSelect = id => { if (G.selected.has(id)) G.selected.delete(id); else G.selected.add(id); G.lastClickedId = id; onRerender(); };
  const rangeSelect  = id => {
    const ids = getVisibleIds(), last = G.lastClickedId;
    if (!last) { toggleSelect(id); return; }
    const [lo, hi] = [ids.indexOf(last), ids.indexOf(id)].sort((a,b)=>a-b);
    if (lo < 0 || hi < 0) { toggleSelect(id); return; }
    for (let i = lo; i <= hi; i++) G.selected.add(ids[i]);
    G.lastClickedId = id; onRerender();
  };
  table.addEventListener('click', e => {
    const check = e.target.closest('.g-check');
    if (check) { e.stopPropagation(); if (e.shiftKey) rangeSelect(check.dataset.id); else toggleSelect(check.dataset.id); return; }
    const cell = e.target.closest('.g-check-cell');
    if (cell) { e.stopPropagation(); if (e.shiftKey) rangeSelect(cell.dataset.id); else toggleSelect(cell.dataset.id); }
  });
  const checkAll = mount.querySelector('#gCheckAll');
  if (checkAll) checkAll.addEventListener('click', e => {
    e.stopPropagation();
    if (checkAll.checked) records.forEach(t => G.selected.add(t.id));
    else G.selected.clear();
    G.lastClickedId = null; onRerender();
  });

  // ─── BULK ACTION BAR ──────────────────────────────────────────────────
  if (G.selected.size > 0) {
    const bar = document.createElement('div');
    bar.style.cssText = `position:absolute;bottom:20px;left:50%;transform:translateX(-50%);
      background:#1A1A22;color:#fff;padding:10px 8px 10px 18px;border-radius:10px;
      box-shadow:0 8px 32px rgba(0,0,0,.24);z-index:150;display:flex;align-items:center;gap:4px;
      font-size:13px;font-weight:500`;
    bar.innerHTML = `
      <span style="margin-right:14px;color:#E0E0E5">${G.selected.size} selected</span>
      <button data-act="indent"  style="background:transparent;border:0;color:#fff;cursor:pointer;padding:6px 10px;border-radius:6px;font-size:12.5px;display:flex;align-items:center;gap:5px"><i class="ti ti-indent-increase" style="font-size:14px"></i>Indent</button>
      <button data-act="outdent" style="background:transparent;border:0;color:#fff;cursor:pointer;padding:6px 10px;border-radius:6px;font-size:12.5px;display:flex;align-items:center;gap:5px"><i class="ti ti-indent-decrease" style="font-size:14px"></i>Outdent</button>
      <button data-act="delete"  style="background:transparent;border:0;color:#FCA5A5;cursor:pointer;padding:6px 10px;border-radius:6px;font-size:12.5px;display:flex;align-items:center;gap:5px"><i class="ti ti-trash" style="font-size:14px"></i>Delete</button>
      <span style="width:1px;height:20px;background:rgba(255,255,255,.15);margin:0 4px"></span>
      <button data-act="clear"   style="background:transparent;border:0;color:#9CA3AF;cursor:pointer;padding:6px 10px;border-radius:6px;font-size:12.5px">Clear</button>`;
    bar.querySelectorAll('button').forEach(b => {
      b.addEventListener('mouseover', () => b.style.background='rgba(255,255,255,.08)');
      b.addEventListener('mouseout',  () => b.style.background='transparent');
    });
    bar.addEventListener('click', e => {
      const btn = e.target.closest('button'); if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'indent')  bulkIndent(new Set(G.selected), spec, db, records, onRerender, ctx);
      else if (act === 'outdent') bulkOutdent(new Set(G.selected), spec, db, records, onRerender, ctx);
      else if (act === 'delete') { if (confirm(`Delete ${G.selected.size} row${G.selected.size===1?'':'s'}?`)) { bulkDelete(new Set(G.selected), spec, db, onRerender); G.selected.clear(); } }
      else if (act === 'clear') { G.selected.clear(); onRerender(); }
    });
    scroll.appendChild(bar);
  }

  // ─── EXPAND / COLLAPSE ────────────────────────────────────────────────
  mount.querySelector('#gExpandAll').addEventListener('click', () => { G.collapsed.clear(); onRerender(); });
  mount.querySelector('#gCollapseAll').addEventListener('click', () => {
    G.collapsed.clear();
    records.forEach(t => { if (childrenOf.has(t.id)) G.collapsed.add(t.id); });
    onRerender();
  });

  // ─── WRAP ─────────────────────────────────────────────────────────────
  mount.querySelector('#gWrapToggle').addEventListener('click', () => {
    G.wrap = !G.wrap; savePrefs(spec, G); onRerender();
  });

  // ─── COLUMNS MENU ─────────────────────────────────────────────────────
  const colsBtn = mount.querySelector('#gColsBtn'), colsMenu = mount.querySelector('#gColsMenu');
  const renderColsMenu = () => {
    colsMenu.innerHTML = `
      <div style="padding:6px 12px 8px;border-bottom:.5px solid rgba(0,0,0,.06);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9CA3AF">Show columns</div>
      ${spec.columns.map(c => {
        const visible = !G.hidden.has(c.id);
        return `<label style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;font-size:12px;color:#374151" onmouseover="this.style.background='rgba(83,74,183,.05)'" onmouseout="this.style.background='transparent'">
          <input type="checkbox" class="col-tgl" data-col="${c.id}" ${visible?'checked':''} style="cursor:pointer;margin:0;accent-color:#534AB7">
          <span style="flex:1">${c.label}</span>
        </label>`;
      }).join('')}
      <div style="border-top:.5px solid rgba(0,0,0,.06);padding:6px 4px 4px">
        <button id="colsReset" style="width:100%;text-align:left;background:transparent;border:0;padding:6px 8px;font-size:11px;color:#6B7280;cursor:pointer;border-radius:5px" onmouseover="this.style.background='rgba(0,0,0,.04)'" onmouseout="this.style.background='transparent'">Reset column order & widths</button>
      </div>`;
    colsMenu.querySelectorAll('.col-tgl').forEach(cb => cb.addEventListener('change', () => {
      const id = cb.dataset.col;
      if (cb.checked) G.hidden.delete(id); else G.hidden.add(id);
      savePrefs(spec, G); onRerender();
    }));
    colsMenu.querySelector('#colsReset').addEventListener('click', () => {
      G.cols = spec.columns.map(c => c.id);
      G.widths = Object.fromEntries(spec.columns.map(c => [c.id, c.w]));
      G.hidden = new Set();
      savePrefs(spec, G); onRerender();
    });
  };
  colsBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (colsMenu.style.display === 'block') { colsMenu.style.display = 'none'; return; }
    renderColsMenu(); colsMenu.style.display = 'block';
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#gColsMenu') && !e.target.closest('#gColsBtn')) colsMenu.style.display = 'none';
  });

  // ─── WRAP MODE: auto-resize name textareas ────────────────────────────
  if (G.wrap) {
    const autoresize = ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    mount.querySelectorAll('.g-name-ta').forEach(ta => { autoresize(ta); ta.addEventListener('input', () => autoresize(ta)); });
  }

  // ─── COLUMN RESIZE ────────────────────────────────────────────────────
  mount.querySelectorAll('.g-th-resize').forEach(grip => {
    grip.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const colId = grip.dataset.col;
      const startX = e.clientX, startW = G.widths[colId] || 120;
      const onMove = ev => {
        const nw = Math.max(50, startW + (ev.clientX - startX));
        G.widths[colId] = nw;
        mount.querySelectorAll(`th[data-col="${colId}"]`).forEach(th => { th.style.width = nw+'px'; th.style.minWidth = nw+'px'; });
        mount.querySelectorAll(`td[data-col="${colId}"]`).forEach(td => { td.style.width = nw+'px'; td.style.minWidth = nw+'px'; td.style.maxWidth = nw+'px'; });
        const cgIdx = G.cols.filter(c => !G.hidden.has(c)).indexOf(colId);
        if (cgIdx >= 0) {
          const cg = mount.querySelector('#gTable > colgroup');
          if (cg && cg.children[cgIdx+1]) cg.children[cgIdx+1].style.width = nw + 'px';
        }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
        savePrefs(spec, G);
      };
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    });
  });

  // ─── COLUMN REORDER (drag headers) ────────────────────────────────────
  let dragColId = null;
  mount.querySelectorAll('.g-th').forEach(th => {
    th.addEventListener('dragstart', e => {
      if (e.target.classList?.contains('g-th-resize')) { e.preventDefault(); return; }
      dragColId = th.dataset.col;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragColId); } catch (_) {}
      th.style.opacity = '0.5';
    });
    th.addEventListener('dragend', () => { th.style.opacity = ''; mount.querySelectorAll('.g-th').forEach(t => t.style.borderLeft=''); dragColId = null; });
    th.addEventListener('dragover', e => {
      if (!dragColId || dragColId === th.dataset.col) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      th.style.borderLeft = '2px solid #534AB7';
    });
    th.addEventListener('dragleave', () => { th.style.borderLeft = ''; });
    th.addEventListener('drop', e => {
      e.preventDefault();
      const targetColId = th.dataset.col;
      if (!dragColId || dragColId === targetColId) return;
      const arr = [...G.cols];
      const from = arr.indexOf(dragColId); let to = arr.indexOf(targetColId);
      if (from < 0 || to < 0) return;
      arr.splice(from, 1); if (from < to) to--;
      arr.splice(to, 0, dragColId);
      G.cols = arr; savePrefs(spec, G); onRerender();
    });
  });

  // ─── CHEVRON TOGGLE ────────────────────────────────────────────────────
  table.addEventListener('click', e => {
    const chev = e.target.closest('.g-chev'); if (!chev) return;
    e.stopPropagation();
    const id = chev.dataset.id;
    if (G.collapsed.has(id)) G.collapsed.delete(id); else G.collapsed.add(id);
    onRerender();
  });

  // ─── INLINE EDITING (change events) ────────────────────────────────────
  table.addEventListener('change', e => {
    const el = e.target.closest('.g-in'); if (!el) return;
    const recId = el.dataset.id, colId = el.dataset.col;
    const rec = db.get(spec.table, recId);
    if (!rec) return;

    let value;
    if (el.type === 'number')    value = el.value === '' ? null : +el.value;
    else if (el.type === 'date') value = el.value || null;
    else                         value = el.value === '' ? null : el.value;

    // Owner column special-case: "+ Add person…" for tasks
    if (colId === 'owner_id' && value === '__add_person__') {
      const name = prompt('Person name:');
      if (!name || !name.trim()) { el.value = rec.owner_id || ''; return; }
      const trimmed = name.trim();
      const initials = trimmed.split(/\s+/).map(w => w[0]||'').join('').slice(0,2).toUpperCase() || '?';
      const palette = ['#5B7FCC','#5B9E7F','#9B67C2','#C47B3E','#D4716A','#7F77DD','#1D9E75','#BA7517'];
      const hash = [...trimmed].reduce((a,c) => a + c.charCodeAt(0), 0);
      const newP = db.insert('people', { name: trimmed, initials, color: palette[hash % palette.length], is_client: false, org: null });
      db.update(spec.table, recId, { owner_id: newP.id });
      onRerender(); return;
    }

    const patch = { [colId]: value };
    db.update(spec.table, recId, patch);

    spec.onChange(rec, patch, ctx, db, onRerender);

    if (spec.rollup) {
      const col = spec.columns.find(c => c.id === colId);
      if (col && col.rollup && rec.parent_id) spec.rollup(rec.parent_id, ctx, db, records);
    }

    const REPAINT = new Set(['type', ...spec.columns.filter(c => c.rollup).map(c => c.id)]);
    if (REPAINT.has(colId)) onRerender();
  });

  // ─── NAME BLUR (save-on-blur for text input) ──────────────────────────
  table.addEventListener('blur', e => {
    const el = e.target.closest('.g-in'); if (!el || el.dataset.col !== 'name') return;
    const rec = db.get(spec.table, el.dataset.id);
    if (!rec) return;
    if ((rec.name || '') !== el.value) {
      db.update(spec.table, el.dataset.id, { name: el.value });
      spec.onChange(rec, { name: el.value }, ctx, db, onRerender);
    }
  }, true);

  // ─── ENTER = new row, TAB = indent/outdent ────────────────────────────
  table.addEventListener('keydown', e => {
    const el = e.target.closest('.g-in'); if (!el || el.dataset.col !== 'name') return;
    if (e.key === 'Enter') {
      if (G.wrap && e.shiftKey) return;
      e.preventDefault();
      const recId = el.dataset.id, rec = db.get(spec.table, recId);
      if (rec) db.update(spec.table, recId, { name: el.value });
      const defaults = spec.newRow(ctx, {
        parent_id: rec?.parent_id || null,
        deliverable_id: rec?.deliverable_id || null,
        sprint_id: rec?.sprint_id || null,
        sort_order: nextSort(),
      });
      const newRec = db.insert(spec.table, defaults);
      onRerender();
      requestAnimationFrame(() => mount.querySelector(`.g-in[data-id="${newRec.id}"][data-col="name"]`)?.focus());
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const recId = el.dataset.id, rec = db.get(spec.table, recId);
      if (rec) db.update(spec.table, recId, { name: el.value });
      if (e.shiftKey) outdentRow(recId, spec, db, records, onRerender, ctx);
      else            indentRow(recId, spec, db, records, onRerender, ctx);
    }
  });

  // ─── HOVER: drag handle + open button ─────────────────────────────────
  table.addEventListener('mouseover', e => {
    const row = e.target.closest('.g-row');
    if (row) row.querySelectorAll('.g-drag, .g-open').forEach(h => h.style.opacity = '1');
  });
  table.addEventListener('mouseout', e => {
    const row = e.target.closest('.g-row');
    if (row && !row.matches(':hover')) row.querySelectorAll('.g-drag, .g-open').forEach(h => h.style.opacity = '0');
  });
  table.addEventListener('click', e => {
    const btn = e.target.closest('.g-open'); if (!btn) return;
    e.stopPropagation();
    onSelect?.(btn.dataset.id);
  });

  // ─── DRAG & DROP ROWS ─────────────────────────────────────────────────
  let dragId = null, dropIndicator = null;
  const makeIndicator = () => {
    if (dropIndicator) return dropIndicator;
    dropIndicator = document.createElement('div');
    dropIndicator.style.cssText = 'position:absolute;height:3px;background:#534AB7;border-radius:2px;pointer-events:none;z-index:100;left:0;right:0;box-shadow:0 0 0 1px rgba(83,74,183,.3)';
    scroll.appendChild(dropIndicator);
    return dropIndicator;
  };
  const hideIndicator = () => { if (dropIndicator) dropIndicator.style.display = 'none'; };

  table.addEventListener('dragstart', e => {
    const handle = e.target.closest('.g-drag');
    if (!handle) { e.preventDefault(); return; }
    const row = handle.closest('.g-row'); if (!row) { e.preventDefault(); return; }
    dragId = row.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    row.style.opacity = '0.4'; row.dataset.dragging = '1';
  });
  table.addEventListener('dragend', () => {
    table.querySelectorAll('[data-dragging="1"]').forEach(r => { r.style.opacity=''; delete r.dataset.dragging; });
    dragId = null; hideIndicator();
  });
  table.addEventListener('dragover', e => {
    if (!dragId) return;
    const row = e.target.closest('.g-row'); if (!row) return;
    if (row.dataset.id === dragId) return;
    const desc = getDescendantIds(dragId, records);
    if (desc.has(row.dataset.id)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const rect = row.getBoundingClientRect(), sRect = scroll.getBoundingClientRect();
    const ind = makeIndicator();
    ind.style.display = 'block';
    ind.style.top = `${rect.top - sRect.top + scroll.scrollTop - 1}px`;
    ind.style.left = `${rect.left - sRect.left}px`;
    ind.style.width = `${rect.width}px`;
  });
  table.addEventListener('drop', e => {
    if (!dragId) return;
    const row = e.target.closest('.g-row'); if (!row) return;
    e.preventDefault();
    const targetId = row.dataset.id;
    if (targetId === dragId) { hideIndicator(); return; }
    moveRecordAbove(dragId, targetId, spec, db, records, onRerender, ctx);
    hideIndicator(); dragId = null;
  });

  // ─── + ADD ROW ─────────────────────────────────────────────────────────
  table.addEventListener('click', e => {
    const addRow = e.target.closest('.g-add-row'); if (!addRow) return;
    const groupKey = addRow.dataset.group;
    const extras = { sort_order: nextSort() };
    if (groupKey !== '__none' && groupKey !== '__all') extras.deliverable_id = groupKey;
    const defaults = spec.newRow(ctx, extras);
    const newRec = db.insert(spec.table, defaults);
    onRerender();
    requestAnimationFrame(() => mount.querySelector(`.g-in[data-id="${newRec.id}"][data-col="name"]`)?.focus());
  });

  // ─── RIGHT-CLICK CONTEXT MENU ─────────────────────────────────────────
  const hideCtx = () => { ctxEl.style.display = 'none'; };
  table.addEventListener('contextmenu', e => {
    const row = e.target.closest('.g-row'); if (!row) return;
    e.preventDefault();
    const recId = row.dataset.id, rec = db.get(spec.table, recId);
    if (!rec) return;
    const sorted = [...records].sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
    const idx = sorted.findIndex(t => t.id === recId);
    const above = idx > 0 ? sorted[idx-1] : null;
    const hasKids = childrenOf.has(recId);
    const extraItems = spec.contextExtraItems(rec, ctx, db, onRerender, hideCtx);

    const items = [
      ...spec.contextTypeItems(rec, ctx, db, onRerender, hideCtx),
      null,
      hasKids ? { label:`<i class="ti ti-fold"></i> ${G.collapsed.has(recId) ? 'Expand' : 'Collapse'} children`,
                  action: () => { if (G.collapsed.has(recId)) G.collapsed.delete(recId); else G.collapsed.add(recId); onRerender(); hideCtx(); } } : undefined,
      { label:`<i class="ti ti-plus"></i> Insert row above`, action: () => {
          const t = db.insert(spec.table, spec.newRow(ctx, { parent_id: rec.parent_id||null, deliverable_id: rec.deliverable_id||null, sort_order: (rec.sort_order||nextSort()) - 1 }));
          onRerender(); hideCtx();
          requestAnimationFrame(() => mount.querySelector(`.g-in[data-id="${t.id}"][data-col="name"]`)?.focus());
      } },
      { label:`<i class="ti ti-plus"></i> Insert row below`, action: () => {
          const t = db.insert(spec.table, spec.newRow(ctx, { parent_id: rec.parent_id||null, deliverable_id: rec.deliverable_id||null, sort_order: nextSort() }));
          onRerender(); hideCtx();
          requestAnimationFrame(() => mount.querySelector(`.g-in[data-id="${t.id}"][data-col="name"]`)?.focus());
      } },
      null,
      { label:`<i class="ti ti-arrow-right"></i> Indent`, disabled: !above,          action: () => { indentRow(recId, spec, db, records, onRerender, ctx); hideCtx(); } },
      { label:`<i class="ti ti-arrow-left"></i> Outdent`, disabled: !rec.parent_id,  action: () => { outdentRow(recId, spec, db, records, onRerender, ctx); hideCtx(); } },
      ...(extraItems.length ? [null, ...extraItems] : []),
      null,
      { label:`<i class="ti ti-trash" style="color:#E24B4A"></i> <span style="color:#E24B4A">Delete row</span>`,
        action: () => { if (confirm(`Delete "${rec.name || 'this row'}"?`)) { db.remove(spec.table, recId); onRerender(); } hideCtx(); } },
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
        el.addEventListener('mouseover', () => { if (!item.dim) el.style.background='rgba(83,74,183,.06)'; });
        el.addEventListener('mouseout',  () => { if (!item.dim) el.style.background=''; });
      }
    });
  });

  document.addEventListener('mousedown', e => { if (!e.target.closest('#gCtx')) hideCtx(); });
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC ENTRYPOINTS
// ═══════════════════════════════════════════════════════════════════════════

export function renderGrid({ mount, tasks, people, deliverables, sprints, db, projectId, onSelect, onRerender }) {
  const ctx = { people, deliverables, sprints, projectId };
  renderGridCore({
    mount,
    records: tasks,
    ctx,
    spec: SPEC_TASKS,
    db,
    onSelect,
    onRerender,
  });
}

export function renderTemplateGrid({ mount, records, templateId, db, onRerender }) {
  const ctx = { templateId };
  renderGridCore({
    mount,
    records,
    ctx,
    spec: SPEC_TEMPLATE_TASKS,
    db,
    onSelect: () => {},
    onRerender,
  });
}
