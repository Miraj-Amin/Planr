// templateEditView.js — Hierarchical plan editor for a template.
//
// One unified grid. Every row (phase, task, milestone, deliverable) lives in the
// same table. WBS drives indentation:  "1" → depth 0, "1.1" → depth 1, "1.1.1"
// → depth 2. Deliverables have no WBS so they use their parent's depth + 1.
//
// Rows with children get a chevron that expands/collapses them. Phases show a
// folder icon in their type colour. Milestones show a filled diamond — click to
// toggle back to a plain task. Deliverables show a package icon.
//
// On open the editor auto-migrates two legacy states:
//   1. Flat template_tasks (no phase rows) → create phase rows, reparent tasks,
//      turn primary_deliverable text into deliverable child rows.
//   2. Phase rows without a WBS → backfill from their first child's WBS prefix.
// Both are idempotent.

const PHASE_COLORS = {
  'Initiation & Handover':   '#7F77DD',
  'Design & Discovery':      '#5B9E7F',
  'Development':             '#534AB7',
  'UAT & Testing':           '#BA7517',
  'Deployment Readiness':    '#C47B3E',
  'Go Live':                 '#1D9E75',
  'Hypercare':               '#D4716A',
  'Project Closure':         '#6B7280',
};

export async function renderTemplateEdit({ mount, templateId, templates, template_tasks, db, onBack, onRerender }) {
  const tpl = (templates || []).find(t => t.id === templateId);
  if (!tpl) {
    mount.innerHTML = `<div class="tpl-wrap"><div class="tpl-max">
      <div class="tpl-empty">
        <i class="ti ti-alert-circle" style="font-size:24px;color:#C4C9D4;margin-bottom:8px"></i>
        <div>Template not found.</div>
        <button class="btn" style="margin-top:14px;height:32px;padding:0 14px;font-size:12px" id="tepBackMissing">Back to templates</button>
      </div>
    </div></div>`;
    mount.querySelector('#tepBackMissing')?.addEventListener('click', onBack);
    return;
  }

  const allRows = (template_tasks || []).filter(t => t.template_id === templateId);

  // ── Auto-migrations ─────────────────────────────────────────────
  const needsFlatMigration    = !allRows.some(r => r.type === 'phase') && allRows.length > 0;
  const needsPhaseWbsBackfill = allRows.some(r => r.type === 'phase' && !r.wbs);
  if (needsFlatMigration || needsPhaseWbsBackfill) {
    mount.innerHTML = `<div class="tep-wrap"><div class="tep-body" style="display:flex;align-items:center;justify-content:center;flex:1;color:#6B7280;font-size:13px;gap:10px">
      <i class="ti ti-loader-2" style="font-size:16px;animation:spin .8s linear infinite"></i>
      Reorganising template…
    </div></div>`;
    try {
      if (needsFlatMigration)    await migrateFlatToHierarchy(templateId, allRows, db);
      if (needsPhaseWbsBackfill) await backfillPhaseWbs(templateId, db);
      onRerender();
      return;
    } catch (err) {
      alert(`Couldn't reorganise the template: ${err.message}`);
    }
  }

  // ── Build the tree from parent_id ────────────────────────────────
  const byId = new Map(allRows.map(r => [r.id, r]));
  const childrenOf = new Map();
  allRows.forEach(r => {
    const k = r.parent_id || 'root';
    if (!childrenOf.has(k)) childrenOf.set(k, []);
    childrenOf.get(k).push(r);
  });
  // Sort siblings by WBS if any have it, else by sort_order.
  childrenOf.forEach(arr => arr.sort((a, b) => {
    if (a.wbs && b.wbs) return compareWbs(a.wbs, b.wbs);
    if (a.wbs) return -1;
    if (b.wbs) return  1;
    return (a.sort_order || 0) - (b.sort_order || 0);
  }));

  const totalTasks  = allRows.filter(r => r.type === 'task' || r.type === 'milestone').length;
  const totalPhases = allRows.filter(r => r.type === 'phase').length;

  // ── Collapse state (persisted per template) ──────────────────────
  const collapsedKey = `planr_tpl_collapsed_${templateId}`;
  let collapsed = new Set();
  try { collapsed = new Set(JSON.parse(localStorage.getItem(collapsedKey) || '[]')); } catch (e) {}
  const persistCollapsed = () => { try { localStorage.setItem(collapsedKey, JSON.stringify([...collapsed])); } catch (e) {} };

  // ── Walk the tree into a flat display list ───────────────────────
  const rendered = [];
  const walk = (nodes, depth) => {
    for (const n of nodes) {
      const kids = childrenOf.get(n.id) || [];
      rendered.push({ row: n, depth, hasChildren: kids.length > 0, isCollapsed: collapsed.has(n.id) });
      if (!collapsed.has(n.id) && kids.length) walk(kids, depth + 1);
    }
  };
  walk(childrenOf.get('root') || [], 0);

  // ── Render ───────────────────────────────────────────────────────
  mount.innerHTML = `
    <div class="tep-wrap">
      <div class="tep-header">
        <button class="tep-back-btn" id="tepBack">
          <i class="ti ti-chevron-left" style="font-size:12px"></i>Templates
        </button>
        <div class="tep-title-block">
          <input class="tep-title-in" data-tpl-field="name" value="${escapeAttr(tpl.name || '')}" placeholder="Untitled template">
          <input class="tep-desc-in"  data-tpl-field="description" value="${escapeAttr(tpl.description || '')}" placeholder="Description (optional)">
        </div>
        <div class="tep-stats">
          <div class="tep-stat"><b>${totalTasks}</b><span>tasks</span></div>
          <div class="tep-stat"><b>${totalPhases}</b><span>phases</span></div>
        </div>
      </div>

      <div class="tep-body">
        <div class="tep-scroll">
          <table class="tep-table">
            <colgroup>
              <col style="width:26px">
              <col style="width:80px">
              <col style="min-width:360px">
              <col style="width:130px">
              <col style="width:130px">
              <col style="width:130px">
              <col style="width:54px">
              <col style="width:54px">
              <col style="width:100px">
              <col style="min-width:220px">
              <col style="min-width:150px">
              <col style="width:100px">
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>WBS</th>
                <th>Task / Deliverable</th>
                <th>Workstream</th>
                <th>Owner role</th>
                <th>Accountable</th>
                <th title="Duration (workdays)">Dur</th>
                <th title="Start offset (workdays)">Off</th>
                <th>Depends on</th>
                <th>Acceptance criteria</th>
                <th>Key dependency</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rendered.length === 0
                ? `<tr><td colspan="12" class="tep-empty-inline">This template has no phases yet. Add one below.</td></tr>`
                : rendered.map(r => rowHTML(r, byId)).join('')}
            </tbody>
          </table>
        </div>
        <div class="tep-add-phase-wrap">
          <button class="tep-add-phase-btn" id="tepAddPhase">
            <i class="ti ti-plus" style="font-size:12px"></i>Add phase
          </button>
        </div>
      </div>
    </div>
  `;

  // ── Header wiring ────────────────────────────────────────────────
  mount.querySelector('#tepBack')?.addEventListener('click', onBack);
  mount.querySelectorAll('[data-tpl-field]').forEach(el => {
    el.addEventListener('blur', () => {
      const field = el.dataset.tplField;
      const v = el.value.trim();
      const cur = db.get('templates', templateId);
      if (!cur) return;
      const val = v || null;
      if ((cur[field] || null) !== val) db.update('templates', templateId, { [field]: val });
    });
  });

  // ── Chevron collapse ────────────────────────────────────────────
  mount.querySelectorAll('.tep-chev').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
      persistCollapsed();
      onRerender();
    });
  });

  // ── Inline edits ────────────────────────────────────────────────
  mount.querySelectorAll('.tep-in').forEach(el => {
    const commit = () => {
      const id = el.dataset.id;
      const field = el.dataset.field;
      const cur = db.get('template_tasks', id);
      if (!cur) return;
      let val;
      if (el.type === 'number') {
        const raw = el.value.trim();
        val = raw === '' ? null : parseInt(raw, 10);
        if (!Number.isFinite(val)) val = null;
      } else {
        val = el.value.trim() || null;
      }
      if ((cur[field] ?? null) !== (val ?? null)) db.update('template_tasks', id, { [field]: val });
    };
    el.addEventListener('blur', commit);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && el.tagName === 'INPUT' && el.type !== 'textarea') el.blur(); });
  });

  // ── Milestone toggle ────────────────────────────────────────────
  mount.querySelectorAll('.tep-milestone-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const cur = db.get('template_tasks', id);
      if (!cur) return;
      const nowMilestone = cur.type !== 'milestone';
      db.update('template_tasks', id, {
        type:         nowMilestone ? 'milestone' : 'task',
        is_milestone: nowMilestone,
      });
      onRerender();
    });
  });

  // ── Row actions ─────────────────────────────────────────────────
  mount.querySelectorAll('.tep-add-child').forEach(btn => {
    btn.addEventListener('click', () => {
      const parentId = btn.dataset.id;
      const parent = byId.get(parentId);
      if (!parent) return;
      const siblings = (childrenOf.get(parentId) || []).filter(c => c.type !== 'deliverable');
      const nextIdx = siblings.length + 1;
      const wbs = parent.wbs ? `${parent.wbs}.${nextIdx}` : null;
      const type = parent.type === 'phase' ? 'task' : 'task';
      db.insert('template_tasks', {
        template_id:           templateId,
        parent_id:             parentId,
        type,
        name:                  '',
        wbs,
        phase:                 parent.type === 'phase' ? parent.name : parent.phase,
        duration_workdays:     1,
        start_offset_workdays: 0,
        is_milestone:          false,
        sort_order:            (siblings.length + 1) * 100,
      });
      collapsed.delete(parentId); persistCollapsed();
      onRerender();
    });
  });

  mount.querySelectorAll('.tep-add-deliv').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.dataset.id;
      const existing = (childrenOf.get(taskId) || []).filter(c => c.type === 'deliverable');
      db.insert('template_tasks', {
        template_id: templateId,
        parent_id:   taskId,
        type:        'deliverable',
        name:        '',
        sort_order:  (existing.length + 1) * 100,
      });
      collapsed.delete(taskId); persistCollapsed();
      onRerender();
    });
  });

  mount.querySelectorAll('.tep-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const row = byId.get(id);
      if (!row) return;
      const descendants = countDescendants(id, childrenOf);
      const kindLabel = row.type === 'phase' ? 'phase' : row.type === 'deliverable' ? 'deliverable' : 'task';
      const suffix = descendants ? ` (and ${descendants} row${descendants === 1 ? '' : 's'} beneath)` : '';
      if (!confirm(`Delete ${kindLabel} "${row.name || 'Untitled'}"${suffix}?`)) return;
      // ON DELETE CASCADE handles it in Supabase; also wipe cache descendants.
      const kill = pid => {
        (childrenOf.get(pid) || []).forEach(c => kill(c.id));
        db.remove('template_tasks', pid);
      };
      kill(id);
      collapsed.delete(id); persistCollapsed();
      onRerender();
    });
  });

  mount.querySelectorAll('.tep-up, .tep-down').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const dir = btn.classList.contains('tep-up') ? -1 : 1;
      const row = byId.get(id);
      if (!row) return;
      const siblings = (childrenOf.get(row.parent_id || 'root') || [])
        .filter(s => s.type === row.type || (row.type !== 'deliverable' && s.type !== 'deliverable'))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const idx = siblings.findIndex(s => s.id === id);
      const swap = siblings[idx + dir];
      if (!swap) return;
      const a = row.sort_order || 0, b = swap.sort_order || 0;
      db.update('template_tasks', row.id, { sort_order: b });
      db.update('template_tasks', swap.id, { sort_order: a });
      onRerender();
    });
  });

  // ── Add phase ────────────────────────────────────────────────────
  mount.querySelector('#tepAddPhase')?.addEventListener('click', () => {
    const name = prompt('Phase name:');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const phases = (childrenOf.get('root') || []);
    const nextWbs = String(phases.length + 1);
    const maxSort = phases.length ? Math.max(...phases.map(p => p.sort_order || 0)) : 0;
    db.insert('template_tasks', {
      template_id: templateId,
      parent_id:   null,
      type:        'phase',
      name:        trimmed,
      phase:       trimmed,
      wbs:         nextWbs,
      sort_order:  maxSort + 10000,
    });
    onRerender();
  });
}

// ══════════════════════════════════════════════════════════════════
// One row in the unified grid.
// ══════════════════════════════════════════════════════════════════
function rowHTML({ row, depth, hasChildren, isCollapsed }, byId) {
  // Indent from WBS depth. Deliverables have no WBS, so lean on their parent's
  // depth + 1. Fall back to tree depth for anything odd.
  const wbsDepth = (row.wbs || '').split('.').filter(Boolean).length - 1;
  let indentLevel;
  if (row.type === 'deliverable') {
    const parent = byId.get(row.parent_id);
    const parentWbsDepth = (parent?.wbs || '').split('.').filter(Boolean).length - 1;
    indentLevel = Math.max(0, parentWbsDepth + 1, depth);
  } else if (row.wbs) {
    indentLevel = Math.max(0, wbsDepth);
  } else {
    indentLevel = depth;
  }
  const indent = indentLevel * 18;

  const isPhase       = row.type === 'phase';
  const isMilestone   = row.type === 'milestone';
  const isDeliverable = row.type === 'deliverable';

  const phaseColor = PHASE_COLORS[row.name] || '#534AB7';
  const numCSS = 'font-family:JetBrains Mono, monospace;font-size:11px;text-align:center';
  const wbsCSS = 'font-family:JetBrains Mono, monospace;font-size:11px';

  // Icon + name column
  let iconHTML;
  if (isPhase) {
    iconHTML = `<i class="ti ti-folder-filled tep-type-icon" style="color:${phaseColor}"></i>`;
  } else if (isDeliverable) {
    iconHTML = `<i class="ti ti-package tep-type-icon" style="color:#1D9E75"></i>`;
  } else {
    // Task or milestone — clickable icon toggles milestone flag
    iconHTML = `<button class="tep-milestone-toggle" data-id="${row.id}" title="${isMilestone ? 'Unset milestone' : 'Mark as milestone'}">
      <i class="ti ${isMilestone ? 'ti-diamond-filled' : 'ti-diamond'}" style="font-size:12px;color:${isMilestone ? '#BA7517' : '#C4C9D4'}"></i>
    </button>`;
  }

  const nameStyle = isPhase       ? 'font-weight:600;font-size:12.5px'
                  : isDeliverable ? 'font-weight:400;color:#374151;font-size:11.5px'
                  : 'font-weight:500';
  const namePlaceholder = isPhase ? 'Phase name' : isDeliverable ? 'Deliverable' : 'Task name';

  // Action buttons on the right — vary by type
  const addChildBtn  = (isPhase || (!isDeliverable && !isMilestone))
    ? `<button class="tep-row-btn tep-add-child" data-id="${row.id}" title="Add ${isPhase ? 'task' : 'sub-task'}"><i class="ti ti-plus" style="font-size:11px"></i></button>` : '';
  const addDelivBtn  = (!isPhase && !isDeliverable)
    ? `<button class="tep-row-btn tep-add-deliv" data-id="${row.id}" title="Add deliverable"><i class="ti ti-package-plus" style="font-size:11px"></i></button>` : '';

  const rowClass = `tep-row tep-row-${row.type}`;

  // Non-name columns — blank on phases/deliverables
  const nonNameCells = isPhase || isDeliverable
    ? `<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>`
    : `
      <td><input class="tep-in" data-id="${row.id}" data-field="workstream" value="${escapeAttr(row.workstream || '')}"></td>
      <td><input class="tep-in" data-id="${row.id}" data-field="owner_role" value="${escapeAttr(row.owner_role || '')}" placeholder="e.g. Project Manager"></td>
      <td><input class="tep-in" data-id="${row.id}" data-field="accountable_role" value="${escapeAttr(row.accountable_role || '')}"></td>
      <td><input class="tep-in" type="number" min="0" data-id="${row.id}" data-field="duration_workdays" value="${row.duration_workdays ?? ''}" style="${numCSS}"></td>
      <td><input class="tep-in" type="number" min="0" data-id="${row.id}" data-field="start_offset_workdays" value="${row.start_offset_workdays ?? ''}" style="${numCSS}"></td>
      <td><input class="tep-in" data-id="${row.id}" data-field="predecessor_wbs" value="${escapeAttr(row.predecessor_wbs || '')}" style="${wbsCSS}"></td>
      <td><input class="tep-in" data-id="${row.id}" data-field="acceptance_criteria" value="${escapeAttr(row.acceptance_criteria || '')}" placeholder="What does done look like?"></td>
      <td><input class="tep-in" data-id="${row.id}" data-field="key_dependency" value="${escapeAttr(row.key_dependency || '')}"></td>
    `;

  return `<tr class="${rowClass}" data-id="${row.id}">
    <td class="tep-chev-cell">
      ${hasChildren ? `<button class="tep-chev" data-id="${row.id}" title="${isCollapsed ? 'Expand' : 'Collapse'}">
        <i class="ti ${isCollapsed ? 'ti-chevron-right' : 'ti-chevron-down'}" style="font-size:11px"></i>
      </button>` : ''}
    </td>
    <td>
      <input class="tep-in" data-id="${row.id}" data-field="wbs" value="${escapeAttr(row.wbs || '')}" style="${wbsCSS}" ${isDeliverable ? 'disabled' : ''}>
    </td>
    <td class="tep-name-td">
      <div class="tep-name-cell" style="padding-left:${indent}px">
        ${iconHTML}
        <input class="tep-in tep-name-in" data-id="${row.id}" data-field="name" value="${escapeAttr(row.name || '')}" placeholder="${namePlaceholder}" style="${nameStyle}">
      </div>
    </td>
    ${nonNameCells}
    <td class="tep-actions">
      ${addChildBtn}${addDelivBtn}
      <button class="tep-row-btn tep-up"   data-id="${row.id}" title="Move up"><i class="ti ti-chevron-up"   style="font-size:11px"></i></button>
      <button class="tep-row-btn tep-down" data-id="${row.id}" title="Move down"><i class="ti ti-chevron-down" style="font-size:11px"></i></button>
      <button class="tep-row-btn tep-del"  data-id="${row.id}" title="Delete"><i class="ti ti-trash" style="font-size:11px"></i></button>
    </td>
  </tr>`;
}

// ══════════════════════════════════════════════════════════════════
// Migrations
// ══════════════════════════════════════════════════════════════════
async function migrateFlatToHierarchy(templateId, allRows, db) {
  const phaseNames = [];
  const seenPhases = new Set();
  const sorted = allRows.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  sorted.forEach(r => {
    const p = r.phase || '(No phase)';
    if (!seenPhases.has(p)) { seenPhases.add(p); phaseNames.push(p); }
  });

  // Extract phase WBS from first task per phase
  const phaseWbs = new Map();
  phaseNames.forEach((name, i) => {
    const first = sorted.find(r => (r.phase || '(No phase)') === name && r.wbs);
    phaseWbs.set(name, first ? String(first.wbs).split('.')[0] : String(i + 1));
  });

  const phaseIds = new Map(phaseNames.map(name => [name, crypto.randomUUID()]));

  // Round 1: phase rows
  await Promise.all(phaseNames.map((name, i) => db.insertAwait('template_tasks', {
    id:          phaseIds.get(name),
    template_id: templateId,
    parent_id:   null,
    type:        'phase',
    name,
    phase:       name,
    wbs:         phaseWbs.get(name),
    sort_order:  (i + 1) * 10000,
  })));

  // Round 2: reparent existing rows + set type
  await Promise.all(sorted.map(t => db.updateAwait('template_tasks', t.id, {
    parent_id: phaseIds.get(t.phase || '(No phase)'),
    type:      t.is_milestone ? 'milestone' : 'task',
  })));

  // Round 3: deliverable rows from primary_deliverable text
  const withDelivs = sorted.filter(t => t.primary_deliverable && String(t.primary_deliverable).trim());
  await Promise.all(withDelivs.map(t => db.insertAwait('template_tasks', {
    template_id: templateId,
    parent_id:   t.id,
    type:        'deliverable',
    name:        t.primary_deliverable,
    sort_order:  100,
  })));
}

async function backfillPhaseWbs(templateId, db) {
  const rows = db.all('template_tasks').filter(r => r.template_id === templateId);
  const phases = rows.filter(r => r.type === 'phase' && !r.wbs)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  await Promise.all(phases.map((p, i) => {
    const child = rows.find(r => r.parent_id === p.id && r.wbs);
    const wbs = child ? String(child.wbs).split('.')[0] : String(i + 1);
    return db.updateAwait('template_tasks', p.id, { wbs });
  }));
}

// ══════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════
function countDescendants(id, childrenOf) {
  let n = 0;
  const kids = childrenOf.get(id) || [];
  for (const c of kids) n += 1 + countDescendants(c.id, childrenOf);
  return n;
}

// Compare WBS numerically part-by-part so "1.2" sorts before "1.10".
function compareWbs(a, b) {
  const ap = String(a).split('.').map(x => parseInt(x, 10) || 0);
  const bp = String(b).split('.').map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const d = (ap[i] || 0) - (bp[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
