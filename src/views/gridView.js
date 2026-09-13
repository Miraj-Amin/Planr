// gridView.js — inline-editable spreadsheet grid for the Plan tab.
// Groups tasks by deliverable. Click any cell to edit inline.
// Enter = new row below. Tab = next cell / indent. Shift+Tab = outdent.
// Right-click = context menu. Drag column headers to reorder.

import { fmt } from '../lib/dates.js';

// ── column definitions ─────────────────────────────────────────────────────
const ALL_COLS = [
  { id:'name',         label:'Task',     w:320, fixed:true },
  { id:'status',       label:'Status',   w:120 },
  { id:'owner_id',     label:'Owner',    w:110 },
  { id:'type',         label:'Type',     w:90  },
  { id:'start_date',   label:'Start',    w:90  },
  { id:'end_date',     label:'Due',      w:90  },
  { id:'duration_days',label:'Dur',      w:58  },
  { id:'effort_min',   label:'Effort',   w:72  },
  { id:'sprint_id',    label:'Sprint',   w:110 },
  { id:'progress',     label:'%',        w:60  },
];
const STATUSES =['todo','in-progress','blocked','review','done'];
const STATUS_L ={todo:'To do','in-progress':'In progress',blocked:'Blocked',review:'Review',done:'Done'};
const STATUS_C ={todo:'#A0A7B4','in-progress':'#7F77DD',blocked:'#E24B4A',review:'#BA7517',done:'#1D9E75'};
const TYPES    =['task','deliverable','milestone','agenda','followup','phase'];
const EFFORT   =[[0,'—'],[15,'15m'],[30,'30m'],[60,'1h'],[120,'2h'],[240,'4h'],[480,'1d']];
const TODAY    = new Date(2026,8,13);

// ── module state ───────────────────────────────────────────────────────────
let G = {
  cols: ALL_COLS.map(c=>c.id),
  widths: Object.fromEntries(ALL_COLS.map(c=>[c.id,c.w])),
  dragCol: null, dragOverCol: null,
  ctxMenu: null,
  colWidthDrag: null,
};

// ── helpers ────────────────────────────────────────────────────────────────
const colDef = id => ALL_COLS.find(c=>c.id===id)||ALL_COLS[0];
const av = (p,sz=22) => p
  ? `<span style="display:inline-flex;width:${sz}px;height:${sz}px;border-radius:50%;background:${p.color};align-items:center;justify-content:center;font-size:${sz*0.4}px;font-weight:500;color:#fff;flex-shrink:0">${p.initials}</span>`
  : '';
const effLabel = m => { const e=EFFORT.find(x=>x[0]===m); return e?e[1]:(m?m+'m':'—'); };
const isOverdue = t => { const d=t.end_date?new Date(t.end_date+'T00:00:00'):null; return !!d&&d<TODAY&&t.status!=='done'; };

// ── cell display ───────────────────────────────────────────────────────────
function cellDisplay(colId, task, ctx) {
  const { people, deliverables, sprints } = ctx;
  switch(colId) {
    case 'name': {
      const dot = `<span style="width:7px;height:7px;border-radius:50%;flex-shrink:0;background:${STATUS_C[task.status]||'#ccc'}"></span>`;
      const nameStyle = task.type==='phase'?'font-weight:500;color:#3C3489':
                        task.type==='deliverable'?'font-weight:500;color:#0F6E56':
                        task.type==='milestone'?'font-weight:500;color:#854F0B':'';
      return `<span style="display:flex;align-items:center;gap:6px;min-width:0">
        ${dot}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${nameStyle}">${task.name||'Untitled'}</span></span>`;
    }
    case 'status': {
      const c=STATUS_C[task.status]||'#ccc',l=STATUS_L[task.status]||task.status;
      return `<span style="display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:500;background:${c}1a;color:${c};white-space:nowrap">${l}</span>`;
    }
    case 'owner_id': {
      const p=people.find(x=>x.id===task.owner_id);
      return p?`<span style="display:flex;align-items:center;gap:6px">${av(p)}<span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</span></span>`:'<span style="color:#C4C9D4;font-size:12px">—</span>';
    }
    case 'type': {
      const colors={task:'#6B7280',deliverable:'#1D9E75',milestone:'#BA7517',agenda:'#378ADD',followup:'#D4716A',phase:'#534AB7'};
      const c=colors[task.type]||'#6B7280';
      return `<span style="font-size:10px;font-weight:500;padding:2px 7px;border-radius:4px;background:${c}1a;color:${c};white-space:nowrap;text-transform:capitalize">${task.type}</span>`;
    }
    case 'start_date': return task.start_date
      ? `<span style="font-size:12px;font-family:monospace">${fmt(task.start_date)}</span>`
      : '<span style="color:#C4C9D4;font-size:12px">—</span>';
    case 'end_date': {
      const over=isOverdue(task);
      return task.end_date
        ? `<span style="font-size:12px;font-family:monospace;color:${over?'#E24B4A':'inherit'}">${fmt(task.end_date)}</span>`
        : '<span style="color:#C4C9D4;font-size:12px">—</span>';
    }
    case 'duration_days': return task.duration_days
      ? `<span style="font-size:12px;font-family:monospace">${task.duration_days}d</span>`
      : '<span style="color:#C4C9D4;font-size:12px">—</span>';
    case 'effort_min': return `<span style="font-size:12px;font-family:monospace">${effLabel(task.effort_min)}</span>`;
    case 'sprint_id': {
      const s=sprints.find(x=>x.id===task.sprint_id);
      return s?`<span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name}</span>`:'<span style="color:#C4C9D4;font-size:12px">—</span>';
    }
    case 'progress': {
      const pct=task.progress||0;
      return `<span style="display:flex;align-items:center;gap:5px;width:100%">
        <span style="flex:1;height:4px;background:rgba(0,0,0,.08);border-radius:2px;overflow:hidden">
          <span style="display:block;height:100%;width:${pct}%;background:${task.status==='done'?'#1D9E75':'#534AB7'};border-radius:2px"></span></span>
        <span style="font-size:11px;font-family:monospace;color:#9CA3AF;flex-shrink:0">${pct}%</span></span>`;
    }
    default: return '—';
  }
}

// ── cell editor ─────────────────────────────────────────────────────────────
function makeEditor(colId, task, ctx, onSave, onEnter, onTabDir) {
  const { people, sprints } = ctx;
  const input = document.createElement('input');
  const sel = document.createElement('select');
  const b = 'border:none;outline:none;width:100%;background:transparent;font-size:13px;font-family:inherit;color:#1A1A22;padding:0';

  let el;
  switch(colId) {
    case 'name': {
      el = input; el.type='text'; el.value=task.name||''; el.style.cssText=b;
      el.addEventListener('keydown',e=>{
        if(e.key==='Enter'){e.preventDefault();onEnter();}
        if(e.key==='Tab'){e.preventDefault();onTabDir(e.shiftKey?-1:1);}
        if(e.key==='Escape'){e.preventDefault();onSave(task.name);}
      });
      el.addEventListener('blur',()=>onSave(el.value));
      break;
    }
    case 'status': {
      el=sel; el.style.cssText=b+'cursor:pointer';
      STATUSES.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=STATUS_L[s];if(s===task.status)o.selected=true;el.appendChild(o);});
      el.addEventListener('change',()=>onSave(el.value));
      el.addEventListener('keydown',e=>{if(e.key==='Escape')onSave(task.status);});
      el.addEventListener('blur',()=>onSave(el.value));
      break;
    }
    case 'owner_id': {
      el=sel; el.style.cssText=b+'cursor:pointer';
      const blank=document.createElement('option');blank.value='';blank.textContent='Unassigned';if(!task.owner_id)blank.selected=true;el.appendChild(blank);
      people.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name+(p.is_client?' (client)':'');if(p.id===task.owner_id)o.selected=true;el.appendChild(o);});
      el.addEventListener('change',()=>onSave(el.value||null));
      el.addEventListener('blur',()=>onSave(el.value||null));
      break;
    }
    case 'type': {
      el=sel; el.style.cssText=b+'cursor:pointer';
      TYPES.forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;if(t===task.type)o.selected=true;el.appendChild(o);});
      el.addEventListener('change',()=>onSave(el.value));
      el.addEventListener('blur',()=>onSave(el.value));
      break;
    }
    case 'start_date':
    case 'end_date': {
      el=input; el.type='date'; el.value=task[colId]||''; el.style.cssText=b;
      el.addEventListener('change',()=>onSave(el.value||null));
      el.addEventListener('keydown',e=>{if(e.key==='Escape')onSave(task[colId]);if(e.key==='Tab'){e.preventDefault();onTabDir(e.shiftKey?-1:1);}});
      el.addEventListener('blur',()=>onSave(el.value||null));
      break;
    }
    case 'duration_days':
    case 'progress': {
      el=input; el.type='number'; el.min='0';
      if(colId==='progress'){el.max='100';}
      el.value=task[colId]||''; el.style.cssText=b;
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();onSave(el.value?+el.value:null);}if(e.key==='Escape')onSave(task[colId]);});
      el.addEventListener('blur',()=>onSave(el.value?+el.value:null));
      break;
    }
    case 'effort_min': {
      el=sel; el.style.cssText=b+'cursor:pointer';
      EFFORT.forEach(([v,l])=>{const o=document.createElement('option');o.value=v;o.textContent=l;if(v===task.effort_min)o.selected=true;el.appendChild(o);});
      el.addEventListener('change',()=>onSave(+el.value));
      el.addEventListener('blur',()=>onSave(+el.value));
      break;
    }
    case 'sprint_id': {
      el=sel; el.style.cssText=b+'cursor:pointer';
      const blank=document.createElement('option');blank.value='';blank.textContent='Backlog';if(!task.sprint_id)blank.selected=true;el.appendChild(blank);
      sprints.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name;if(s.id===task.sprint_id)o.selected=true;el.appendChild(o);});
      el.addEventListener('change',()=>onSave(el.value||null));
      el.addEventListener('blur',()=>onSave(el.value||null));
      break;
    }
    default: el=input; el.type='text'; el.value=''; el.style.cssText=b;
  }
  return el;
}

// ── row HTML ───────────────────────────────────────────────────────────────
function rowHTML(task, indent, ctx) {
  const bg = task.type==='phase'?'rgba(83,74,183,.04)':
             task.type==='deliverable'?'rgba(29,158,117,.03)':'#fff';
  const stripColor = task.type==='phase'?'#534AB7':task.type==='deliverable'?'#1D9E75':'transparent';

  return `<tr class="g-row" data-id="${task.id}" data-indent="${indent}"
    style="background:${bg};position:relative">
    ${G.cols.map((colId,ci) => {
      const col=colDef(colId);
      const nameInd = colId==='name' ? `padding-left:${14+indent*20}px` : '';
      const strip = colId==='name' ? `<span style="position:absolute;left:0;top:0;bottom:0;width:3px;background:${stripColor}"></span>` : '';
      const handle = colId==='name'
        ? `<span class="row-drag-handle" style="opacity:0;cursor:grab;color:#C4C9D4;margin-right:6px;font-size:14px;flex-shrink:0">⠿</span>`
        : '';
      const expander = colId==='name' && task.type==='phase'
        ? `<span class="g-expand" data-id="${task.id}" style="cursor:pointer;color:#9CA3AF;margin-right:5px;font-size:10px;flex-shrink:0">▶</span>`
        : '';
      return `<td class="g-cell" data-id="${task.id}" data-col="${colId}"
        style="padding:0;height:36px;border-bottom:1px solid rgba(0,0,0,.05);border-right:1px solid rgba(0,0,0,.04);position:relative;min-width:0;max-width:${G.widths[colId]}px;width:${G.widths[colId]}px">
        ${strip}
        <div class="g-cell-inner" style="display:flex;align-items:center;padding:0 10px;height:100%;${nameInd};gap:4px;overflow:hidden;min-width:0">
          ${handle}${expander}${cellDisplay(colId,task,ctx)}
        </div></td>`;
    }).join('')}
    <td style="width:auto;border-bottom:1px solid rgba(0,0,0,.05)"></td>
  </tr>`;
}

// ── group header ───────────────────────────────────────────────────────────
function groupHeader(label, count, color='#1D9E75') {
  return `<tr class="g-group-hd">
    <td colspan="${G.cols.length+1}" style="padding:0;border-bottom:1px solid rgba(0,0,0,.05)">
      <div style="display:flex;align-items:center;gap:8px;padding:10px 14px 8px;background:rgba(0,0,0,.02);cursor:pointer">
        <span style="font-size:11px;font-weight:500;color:${color};text-transform:uppercase;letter-spacing:.04em">${label}</span>
        <span style="font-size:10px;color:#9CA3AF;background:rgba(0,0,0,.05);padding:1px 6px;border-radius:8px">${count}</span>
      </div>
    </td>
  </tr>`;
}

// ── add row ────────────────────────────────────────────────────────────────
function addRowHTML(groupKey) {
  return `<tr class="g-add-row" data-group="${groupKey}" style="cursor:pointer">
    <td colspan="${G.cols.length+1}" style="padding:6px 14px 8px;border-bottom:1px solid rgba(0,0,0,.04)">
      <span style="font-size:12px;color:#9CA3AF;display:flex;align-items:center;gap:5px">
        <i class="ti ti-plus" style="font-size:11px"></i>Add task</span>
    </td>
  </tr>`;
}

// ── MAIN RENDER ────────────────────────────────────────────────────────────
export function renderGrid({ mount, tasks, people, deliverables, sprints, db, projectId, onSelect, onRerender }) {
  const ctx = { people, deliverables, sprints };

  // build hierarchy map
  const taskMap = new Map(tasks.map(t=>[t.id,t]));
  const childrenOf = id => tasks.filter(t=>t.parent_id===id).sort((a,b)=>a.sort_order-b.sort_order);

  function collectRows(taskId, indent=0) {
    const t = taskMap.get(taskId);
    if(!t) return [];
    return [{ task:t, indent }, ...childrenOf(taskId).flatMap(c=>collectRows(c.id, indent+1))];
  }

  // group by deliverable
  const grouped = new Map();
  grouped.set('__none', { label:'Not linked to a deliverable', rows:[] });
  deliverables.forEach(d => grouped.set(d.id, { label:d.name, rows:[] }));

  // top-level tasks (no parent) sorted by sort_order
  const topLevel = tasks.filter(t=>!t.parent_id).sort((a,b)=>a.sort_order-b.sort_order);
  topLevel.forEach(t => {
    const key = t.deliverable_id || '__none';
    if(!grouped.has(key)) grouped.set(key, {label:'Unknown deliverable',rows:[]});
    grouped.get(key).rows.push(...collectRows(t.id, 0));
  });

  // render header
  const headerCells = G.cols.map(colId => {
    const col = colDef(colId);
    return `<th class="g-col-hd" data-col="${colId}" draggable="true"
      style="position:sticky;top:0;z-index:2;background:#F0F1F4;border-bottom:1px solid rgba(0,0,0,.1);border-right:1px solid rgba(0,0,0,.06);
             padding:0 10px;height:28px;font-size:10.5px;font-weight:500;color:#9CA3AF;text-transform:uppercase;letter-spacing:.04em;
             width:${G.widths[colId]}px;min-width:${G.widths[colId]}px;max-width:${G.widths[colId]}px;
             white-space:nowrap;cursor:pointer;user-select:none;text-align:left;vertical-align:middle">
      ${col.label}
      <span class="col-resize" data-col="${colId}"
        style="position:absolute;right:0;top:0;bottom:0;width:6px;cursor:col-resize;z-index:3"></span>
    </th>`;
  }).join('');

  // render body
  let bodyHTML = '';
  grouped.forEach((group, key) => {
    if(!group.rows.length && key!=='__none') return;
    const dl = key!=='__none' ? deliverables.find(d=>d.id===key) : null;
    const color = dl ? '#1D9E75' : '#9CA3AF';
    bodyHTML += groupHeader(group.label, group.rows.length, color);
    group.rows.forEach(({ task, indent }) => {
      bodyHTML += rowHTML(task, indent, ctx);
    });
    bodyHTML += addRowHTML(key);
  });

  mount.innerHTML = `
    <div style="flex:1;overflow:auto;background:#fff;position:relative" id="gridScroll">
      <table id="gridTable" style="width:100%;border-collapse:collapse;table-layout:fixed">
        <colgroup>${G.cols.map(c=>`<col style="width:${G.widths[c]}px">`).join('')}<col></colgroup>
        <thead><tr>${headerCells}<th style="background:#F0F1F4;border-bottom:1px solid rgba(0,0,0,.1)"></th></tr></thead>
        <tbody id="gridBody">${bodyHTML}</tbody>
      </table>
      <div id="ctxMenu" style="display:none;position:absolute;background:#fff;border:.5px solid rgba(0,0,0,.12);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:100;min-width:180px;padding:4px 0"></div>
    </div>`;

  const table = mount.querySelector('#gridTable');
  const ctxMenu = mount.querySelector('#ctxMenu');

  // ── cell click → inline edit ────────────────────────────────────────────
  let activeCell = null;

  function deactivate() {
    if(activeCell) {
      activeCell.classList.remove('g-editing');
      const inner = activeCell.querySelector('.g-cell-inner');
      const task = db.get('tasks', activeCell.dataset.id);
      if(task) inner.innerHTML = cellDisplay(activeCell.dataset.col, task, ctx) || '—';
      activeCell = null;
    }
  }

  function activateCell(td) {
    if(activeCell === td) return;
    deactivate();
    const taskId = td.dataset.id, colId = td.dataset.col;
    const task = db.get('tasks', taskId);
    if(!task) return;
    activeCell = td;
    td.classList.add('g-editing');
    const inner = td.querySelector('.g-cell-inner');

    const onSave = (value) => {
      const patch = { [colId]: value };
      if(colId==='progress'&&value>=100) patch.status='done';
      db.update('tasks', taskId, patch);
      const updated = db.get('tasks', taskId);
      if(inner) inner.innerHTML = cellDisplay(colId, updated, ctx);
      td.classList.remove('g-editing');
      if(activeCell===td) activeCell=null;
    };

    const onEnter = () => {
      const val = inner.querySelector('input,select')?.value;
      if(val!==undefined) {
        const patch = {[colId]:colId==='status'||colId==='owner_id'||colId==='type'||colId==='sprint_id'?val||null:val};
        db.update('tasks', taskId, patch);
      }
      deactivate();
      insertBelow(taskId, projectId, db, ctx, onRerender);
    };

    const onTabDir = (dir) => {
      const val = inner.querySelector('input,select')?.value;
      if(val!==undefined) {
        const patch={[colId]:val||null};
        db.update('tasks',taskId,patch);
      }
      deactivate();
      if(dir===1 && colId==='name') { indentTask(taskId,db,tasks,onRerender); return; }
      if(dir===-1 && colId==='name') { outdentTask(taskId,db,tasks,onRerender); return; }
      // move to next/prev column
      const ci = G.cols.indexOf(colId);
      const next = G.cols[ci+dir];
      if(next) {
        const nextTd = table.querySelector(`td[data-id="${taskId}"][data-col="${next}"]`);
        if(nextTd) activateCell(nextTd);
      }
    };

    const editor = makeEditor(colId, task, ctx, onSave, onEnter, onTabDir);
    // clear display, show editor
    const expander = inner.querySelector('.g-expand');
    const handle = inner.querySelector('.row-drag-handle');
    inner.innerHTML = '';
    if(colId==='name') {
      if(handle){ const h=handle.cloneNode(true);inner.appendChild(h);}
    }
    inner.style.paddingLeft = colId==='name' ? `${14+(task.sort_order?0:0)}px` : '';
    inner.appendChild(editor);
    editor.focus();
    if(editor.select) editor.select();
  }

  table.addEventListener('mousedown', e => {
    const td = e.target.closest('.g-cell');
    if(td && !e.target.closest('.col-resize')) {
      e.preventDefault();
      activateCell(td);
    }
  });

  // hover to show drag handle
  table.addEventListener('mouseover', e => {
    const row = e.target.closest('.g-row');
    if(row) row.querySelectorAll('.row-drag-handle').forEach(h=>h.style.opacity='1');
  });
  table.addEventListener('mouseout', e => {
    const row = e.target.closest('.g-row');
    if(row&&!row.matches(':hover')) row.querySelectorAll('.row-drag-handle').forEach(h=>h.style.opacity='0');
  });

  // ── add row click ────────────────────────────────────────────────────────
  table.addEventListener('click', e => {
    const addRow = e.target.closest('.g-add-row');
    if(addRow) {
      const groupKey = addRow.dataset.group;
      const dl = groupKey!=='__none' ? deliverables.find(d=>d.id===groupKey) : null;
      const task = db.insert('tasks', {
        project_id: projectId, type:'task', name:'', status:'todo',
        deliverable_id: dl?.id||null, progress:0, effort_min:0, priority:'normal',
        flagged:false, sort_order: Date.now(),
      });
      onRerender(() => {
        const newTd = table.querySelector(`td[data-id="${task.id}"][data-col="name"]`);
        if(newTd) activateCell(newTd);
      });
    }
  });

  // ── right-click context menu ─────────────────────────────────────────────
  table.addEventListener('contextmenu', e => {
    const row = e.target.closest('.g-row');
    if(!row) return;
    e.preventDefault();
    const taskId = row.dataset.id;
    const task = db.get('tasks', taskId);
    if(!task) return;
    const scroll = mount.querySelector('#gridScroll');
    const rect = scroll.getBoundingClientRect();
    const items = [
      { label:'<i class="ti ti-plus"></i> Insert row above',  action:()=>{ insertAbove(taskId,projectId,db,onRerender); hideCtx(); }},
      { label:'<i class="ti ti-plus"></i> Insert row below',  action:()=>{ insertBelow(taskId,projectId,db,ctx,onRerender); hideCtx(); }},
      null,
      { label:'<i class="ti ti-arrow-right"></i> Indent (make child)', action:()=>{ indentTask(taskId,db,tasks,onRerender); hideCtx(); }},
      { label:'<i class="ti ti-arrow-left"></i> Outdent (promote)',    action:()=>{ outdentTask(taskId,db,tasks,onRerender); hideCtx(); }},
      null,
      { label:'<i class="ti ti-flag"></i> Flag for agenda',   action:()=>{ db.update('tasks',taskId,{flagged:!task.flagged}); onRerender(); hideCtx(); }},
      null,
      { label:'<i class="ti ti-trash" style="color:#E24B4A"></i> <span style="color:#E24B4A">Delete task</span>',
        action:()=>{ if(confirm(`Delete "${task.name}"?`)){ db.remove('tasks',taskId); onRerender(); } hideCtx(); }},
    ];
    ctxMenu.innerHTML = items.map(item=>item===null
      ? '<div style="height:1px;background:rgba(0,0,0,.07);margin:3px 0"></div>'
      : `<div class="ctx-item" style="padding:7px 14px;font-size:12.5px;cursor:pointer;display:flex;align-items:center;gap:8px;color:#1A1A22">${item.label}</div>`
    ).join('');
    ctxMenu.style.cssText=`display:block;position:absolute;left:${e.clientX-rect.left+scroll.scrollLeft}px;top:${e.clientY-rect.top+scroll.scrollTop}px;background:#fff;border:.5px solid rgba(0,0,0,.12);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:100;min-width:200px;padding:4px 0`;
    ctxMenu.querySelectorAll('.ctx-item').forEach((el,i)=>{
      const item=items.filter(x=>x!==null)[i-(items.slice(0,i+1).filter(x=>x===null).length)];
      // recalculate which item this corresponds to
    });
    // re-wire with correct index
    let realIdx=0;
    ctxMenu.querySelectorAll('.ctx-item').forEach(el=>{
      while(items[realIdx]===null)realIdx++;
      const it=items[realIdx++];
      el.addEventListener('click',it.action);
      el.addEventListener('mouseover',()=>el.style.background='rgba(83,74,183,.06)');
      el.addEventListener('mouseout',()=>el.style.background='');
    });
  });

  function hideCtx(){ ctxMenu.style.display='none'; }
  document.addEventListener('click', hideCtx, { once:false });
  mount.addEventListener('click', e=>{ if(!e.target.closest('#ctxMenu'))hideCtx(); });

  // ── column drag to reorder ───────────────────────────────────────────────
  mount.querySelectorAll('.g-col-hd').forEach(th=>{
    th.addEventListener('dragstart',e=>{ G.dragCol=th.dataset.col; e.dataTransfer.effectAllowed='move'; });
    th.addEventListener('dragover',e=>{ e.preventDefault(); G.dragOverCol=th.dataset.col; });
    th.addEventListener('drop',()=>{
      if(G.dragCol&&G.dragOverCol&&G.dragCol!==G.dragOverCol){
        const from=G.cols.indexOf(G.dragCol),to=G.cols.indexOf(G.dragOverCol);
        G.cols.splice(from,1);G.cols.splice(to,0,G.dragCol);
        onRerender();
      }
      G.dragCol=null;G.dragOverCol=null;
    });
  });

  // ── column resize ─────────────────────────────────────────────────────────
  mount.querySelectorAll('.col-resize').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const colId = handle.dataset.col;
      const startX = e.clientX, startW = G.widths[colId];
      const onMove = e2 => { G.widths[colId]=Math.max(60,startW+(e2.clientX-startX)); onRerender(); };
      const onUp = () => { document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); };
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });
  });

  // ── column visibility picker ─────────────────────────────────────────────
  // (triggered from the tools bar, see app.js)
}

// ── indent / outdent ────────────────────────────────────────────────────────
function indentTask(taskId, db, tasks, onRerender) {
  const task = db.get('tasks', taskId);
  if(!task) return;
  const sorted = tasks.filter(t=>t.project_id===task.project_id).sort((a,b)=>a.sort_order-b.sort_order);
  const idx = sorted.findIndex(t=>t.id===taskId);
  if(idx>0) {
    const above = sorted[idx-1];
    if(above.id!==task.parent_id) {
      db.update('tasks', taskId, { parent_id: above.id });
      onRerender();
    }
  }
}

function outdentTask(taskId, db, tasks, onRerender) {
  const task = db.get('tasks', taskId);
  if(!task||!task.parent_id) return;
  const parent = db.get('tasks', task.parent_id);
  db.update('tasks', taskId, { parent_id: parent?.parent_id||null });
  onRerender();
}

// ── insert rows ─────────────────────────────────────────────────────────────
function insertBelow(taskId, projectId, db, ctx, onRerender) {
  const t = db.get('tasks', taskId);
  const task = db.insert('tasks', {
    project_id: projectId, type:'task', name:'', status:'todo',
    parent_id: t?.parent_id||null, deliverable_id: t?.deliverable_id||null,
    sprint_id: t?.sprint_id||null, effort_min:0, priority:'normal',
    progress:0, flagged:false, sort_order:(t?.sort_order||0)+0.5,
  });
  onRerender(() => {});
  return task;
}

function insertAbove(taskId, projectId, db, onRerender) {
  const t = db.get('tasks', taskId);
  db.insert('tasks', {
    project_id: projectId, type:'task', name:'', status:'todo',
    parent_id: t?.parent_id||null, deliverable_id: t?.deliverable_id||null,
    sprint_id: t?.sprint_id||null, effort_min:0, priority:'normal',
    progress:0, flagged:false, sort_order: Math.max(0,(t?.sort_order||1)-0.5),
  });
  onRerender();
}
