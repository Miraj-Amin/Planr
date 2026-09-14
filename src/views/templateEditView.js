// templateEditView.js — Hierarchical plan editor for a template.
//
// Data shape: template_tasks with self-referencing parent_id and type.
//   type='phase'       — top-level, no parent
//   type='task'        — child of a phase
//   type='milestone'   — same as task but rendered with a milestone icon
//   type='deliverable' — child of a task, produced by that task
//
// If a template exists in the old flat shape (no phase rows), we run a
// silent migration on open: create phase rows from the `phase` text field,
// reparent tasks, convert primary_deliverable text into deliverable children.
// This is idempotent — the migration checks for existing phase rows first.

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
        <button class="btn" style="margin-top:14px;height:32px;padding:0 14px;font-size:12px" id="teBackMissing">Back to templates</button>
      </div>
    </div></div>`;
    mount.querySelector('#teBackMissing')?.addEventListener('click', onBack);
    return;
  }

  let allRows = (template_tasks || []).filter(t => t.template_id === templateId);

  // ── Auto-migrate old flat templates to hierarchical ──────────────
  const hasHierarchy = allRows.some(r => r.type === 'phase');
  if (!hasHierarchy && allRows.length > 0) {
    mount.innerHTML = `<div class="te-wrap"><div class="te-body" style="display:flex;align-items:center;justify-content:center;flex:1;color:#6B7280;font-size:13px;gap:10px">
      <i class="ti ti-loader-2" style="font-size:16px;animation:spin .8s linear infinite"></i>
      Reorganising template into phases → tasks → deliverables…
    </div></div>`;
    try {
      await migrateFlatToHierarchy(templateId, allRows, db);
      onRerender();
      return;
    } catch (err) {
      alert(`Couldn't reorganise the template: ${err.message}`);
    }
  }

  // ── Build the tree from parent_id ────────────────────────────────
  const childrenOf = new Map();
  allRows.forEach(r => {
    const k = r.parent_id || 'root';
    if (!childrenOf.has(k)) childrenOf.set(k, []);
    childrenOf.get(k).push(r);
  });
  childrenOf.forEach(arr => arr.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));

  const phases = childrenOf.get('root') || [];
  const tasksIn = phaseId => (childrenOf.get(phaseId) || []).filter(r => r.type !== 'deliverable');
  const delivsOf = taskId  => (childrenOf.get(taskId)  || []).filter(r => r.type === 'deliverable');

  const totalTasks = allRows.filter(r => r.type === 'task' || r.type === 'milestone').length;

  // ── Collapse state persisted per template ────────────────────────
  const collapsedKey = `planr_tpl_collapsed_${templateId}`;
  let collapsed = new Set();
  try { collapsed = new Set(JSON.parse(localStorage.getItem(collapsedKey) || '[]')); } catch (e) {}
  const persistCollapsed = () => { try { localStorage.setItem(collapsedKey, JSON.stringify([...collapsed])); } catch (e) {} };

  // ── Render ───────────────────────────────────────────────────────
  mount.innerHTML = `
    <div class="te-wrap">
      <div class="te-header">
        <button class="te-back-btn" id="teBack">
          <i class="ti ti-chevron-left" style="font-size:12px"></i>Templates
        </button>
        <div class="te-title-block">
          <input class="te-title-in" data-tpl-field="name" value="${escapeAttr(tpl.name || '')}" placeholder="Untitled template">
          <input class="te-desc-in"  data-tpl-field="description" value="${escapeAttr(tpl.description || '')}" placeholder="Description (optional)">
        </div>
        <div class="te-stats">
          <div class="te-stat"><b>${totalTasks}</b><span>tasks</span></div>
          <div class="te-stat"><b>${phases.length}</b><span>phases</span></div>
        </div>
      </div>

      <div class="te-body">
        ${phases.length === 0
          ? `<div class="te-empty-inline">This template has no phases yet. Add one to start.</div>`
          : phases.map(phase => phaseSectionHTML(phase, tasksIn(phase.id), delivsOf, collapsed.has(phase.id))).join('')}
        <div class="te-add-phase-wrap">
          <button class="te-add-phase-btn" id="teAddPhase">
            <i class="ti ti-plus" style="font-size:12px"></i>Add phase
          </button>
        </div>
      </div>
    </div>
  `;

  // ── Header wiring ────────────────────────────────────────────────
  mount.querySelector('#teBack')?.addEventListener('click', onBack);
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

  // ── Phase toggle / rename / delete / add-task ────────────────────
  mount.querySelectorAll('.te-phase-collapse').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
      persistCollapsed();
      onRerender();
    });
  });
  mount.querySelectorAll('.te-phase-rename').forEach(inp => {
    const original = inp.defaultValue;
    inp.addEventListener('blur', () => {
      const v = inp.value.trim();
      if (!v) { inp.value = original; return; }
      if (v === original) return;
      const id = inp.dataset.id;
      db.update('template_tasks', id, { name: v, phase: v });
      // Cascade the `phase` text-field on descendants (nice for legacy queries)
      const descendants = allRows.filter(r => r.parent_id === id);
      descendants.forEach(d => db.update('template_tasks', d.id, { phase: v }));
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });
  mount.querySelectorAll('.te-phase-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const row = allRows.find(r => r.id === id);
      const taskCount = tasksIn(id).length;
      if (!confirm(`Delete phase "${row?.name || ''}" and its ${taskCount} task${taskCount === 1 ? '' : 's'}?`)) return;
      // Cascade delete: FK ON DELETE CASCADE handles it in Supabase, but also
      // wipe the cache so the view is consistent without waiting for a reload.
      const kill = pid => {
        (childrenOf.get(pid) || []).forEach(c => kill(c.id));
        db.remove('template_tasks', pid);
      };
      kill(id);
      collapsed.delete(id); persistCollapsed();
      onRerender();
    });
  });
  mount.querySelectorAll('.te-phase-addtask').forEach(btn => {
    btn.addEventListener('click', () => {
      const phaseId = btn.dataset.id;
      const phaseRow = allRows.find(r => r.id === phaseId);
      const siblings = tasksIn(phaseId);
      const maxSort = siblings.length ? Math.max(...siblings.map(s => s.sort_order || 0)) : 0;
      db.insert('template_tasks', {
        template_id:            templateId,
        parent_id:              phaseId,
        type:                   'task',
        name:                   '',
        phase:                  phaseRow?.name || null,
        duration_workdays:      1,
        start_offset_workdays:  0,
        is_milestone:           false,
        sort_order:             maxSort + 100,
      });
      onRerender();
    });
  });

  // ── Add phase ────────────────────────────────────────────────────
  mount.querySelector('#teAddPhase')?.addEventListener('click', () => {
    const name = prompt('Phase name:');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const maxSort = phases.length ? Math.max(...phases.map(p => p.sort_order || 0)) : 0;
    db.insert('template_tasks', {
      template_id: templateId,
      parent_id:   null,
      type:        'phase',
      name:        trimmed,
      phase:       trimmed,
      sort_order:  maxSort + 10000,
    });
    onRerender();
  });

  // ── Row-level actions (per task or deliverable) ──────────────────
  // Inline edits
  mount.querySelectorAll('.te-in').forEach(el => {
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
  });

  // Toggle milestone
  mount.querySelectorAll('.te-milestone-toggle').forEach(btn => {
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

  // Add deliverable child under a task
  mount.querySelectorAll('.te-add-deliv').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.dataset.id;
      db.insert('template_tasks', {
        template_id: templateId,
        parent_id:   taskId,
        type:        'deliverable',
        name:        '',
        sort_order:  100,
      });
      onRerender();
    });
  });

  // Delete task / deliverable
  mount.querySelectorAll('.te-row-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const row = allRows.find(r => r.id === id);
      const kind = row?.type === 'deliverable' ? 'deliverable' : 'task';
      const kids = (childrenOf.get(id) || []).length;
      const msg = kids ? `Delete this ${kind} and its ${kids} deliverable${kids === 1 ? '' : 's'}?`
                       : `Delete this ${kind}?`;
      if (!confirm(msg)) return;
      const kill = pid => {
        (childrenOf.get(pid) || []).forEach(c => kill(c.id));
        db.remove('template_tasks', pid);
      };
      kill(id);
      onRerender();
    });
  });

  // Reorder rows (up/down among siblings)
  mount.querySelectorAll('.te-row-up, .te-row-down').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const dir = btn.classList.contains('te-row-up') ? -1 : 1;
      const row = allRows.find(r => r.id === id);
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
}

// ══════════════════════════════════════════════════════════════════
// One phase section — a titled block with a table of its tasks and
// deliverables. Deliverables render as indented sub-rows below their task.
// ══════════════════════════════════════════════════════════════════
function phaseSectionHTML(phase, tasks, delivsOf, isCollapsed) {
  const color = PHASE_COLORS[phase.name] || '#9CA3AF';
  return `
    <div class="te-phase">
      <div class="te-phase-head" style="border-left:3px solid ${color}">
        <button class="te-phase-collapse" data-id="${phase.id}">
          <i class="ti ${isCollapsed ? 'ti-chevron-right' : 'ti-chevron-down'}" style="font-size:12px"></i>
        </button>
        <i class="ti ti-folder" style="font-size:12px;color:${color}"></i>
        <input class="te-phase-rename" data-id="${phase.id}" value="${escapeAttr(phase.name || '')}">
        <span class="te-phase-count">${tasks.length}</span>
        <div style="flex:1"></div>
        <button class="te-phase-addtask" data-id="${phase.id}" title="Add task">
          <i class="ti ti-plus" style="font-size:12px"></i>
        </button>
        <button class="te-phase-del" data-id="${phase.id}" title="Delete phase">
          <i class="ti ti-trash" style="font-size:12px"></i>
        </button>
      </div>
      ${isCollapsed ? '' : `
        <div class="te-table-scroll">
          <table class="te-table">
            <thead>
              <tr>
                <th style="width:64px">WBS</th>
                <th style="min-width:320px">Task / Deliverable</th>
                <th style="width:130px">Workstream</th>
                <th style="width:130px">Owner role</th>
                <th style="width:130px">Accountable</th>
                <th style="width:56px" title="Duration in workdays">Dur</th>
                <th style="width:56px" title="Start offset in workdays">Off</th>
                <th style="width:110px">Depends on</th>
                <th style="min-width:220px">Acceptance criteria</th>
                <th style="min-width:150px">Key dependency</th>
                <th style="width:88px"></th>
              </tr>
            </thead>
            <tbody>
              ${tasks.length === 0
                ? `<tr><td colspan="11" style="text-align:center;padding:20px;color:#C4C9D4;font-size:11px">No tasks yet. Click + on the phase header to add one.</td></tr>`
                : tasks.flatMap(t => {
                    const rows = [taskRowHTML(t)];
                    delivsOf(t.id).forEach(d => rows.push(delivRowHTML(d)));
                    return rows;
                  }).join('')
              }
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// A task or milestone row. Milestones show a diamond icon and can be toggled
// back to a plain task by clicking it. WBS depth indents the name column.
function taskRowHTML(t) {
  const isMilestone = t.type === 'milestone';
  const wbsDepth = wbsDepthOf(t.wbs);
  const nameIndent = wbsDepth * 14;
  const numCSS = 'font-family:JetBrains Mono, monospace;font-size:11px;text-align:center';
  return `<tr class="te-row te-row-${t.type}">
    <td><input class="te-in" data-id="${t.id}" data-field="wbs" value="${escapeAttr(t.wbs || '')}" style="font-family:JetBrains Mono, monospace;font-size:11px"></td>
    <td>
      <div class="te-name-cell" style="padding-left:${nameIndent}px">
        <button class="te-milestone-toggle" data-id="${t.id}" title="${isMilestone ? 'Unset milestone' : 'Mark as milestone'}">
          <i class="ti ${isMilestone ? 'ti-diamond-filled' : 'ti-diamond'}" style="font-size:13px;color:${isMilestone ? '#BA7517' : '#C4C9D4'}"></i>
        </button>
        <input class="te-in te-name-in" data-id="${t.id}" data-field="name" value="${escapeAttr(t.name || '')}" placeholder="Task name" style="font-weight:500">
        <button class="te-add-deliv" data-id="${t.id}" title="Add deliverable">
          <i class="ti ti-package-plus" style="font-size:12px"></i>
        </button>
      </div>
    </td>
    <td><input class="te-in" data-id="${t.id}" data-field="workstream" value="${escapeAttr(t.workstream || '')}"></td>
    <td><input class="te-in" data-id="${t.id}" data-field="owner_role" value="${escapeAttr(t.owner_role || '')}" placeholder="e.g. Project Manager"></td>
    <td><input class="te-in" data-id="${t.id}" data-field="accountable_role" value="${escapeAttr(t.accountable_role || '')}"></td>
    <td><input class="te-in" type="number" min="0" data-id="${t.id}" data-field="duration_workdays" value="${t.duration_workdays ?? ''}" style="${numCSS}"></td>
    <td><input class="te-in" type="number" min="0" data-id="${t.id}" data-field="start_offset_workdays" value="${t.start_offset_workdays ?? ''}" style="${numCSS}"></td>
    <td><input class="te-in" data-id="${t.id}" data-field="predecessor_wbs" value="${escapeAttr(t.predecessor_wbs || '')}" style="font-family:JetBrains Mono, monospace;font-size:11px"></td>
    <td><input class="te-in" data-id="${t.id}" data-field="acceptance_criteria" value="${escapeAttr(t.acceptance_criteria || '')}" placeholder="What does done look like?"></td>
    <td><input class="te-in" data-id="${t.id}" data-field="key_dependency" value="${escapeAttr(t.key_dependency || '')}"></td>
    <td style="white-space:nowrap;text-align:right">
      <button class="te-row-btn te-row-up"   data-id="${t.id}" title="Move up"><i class="ti ti-chevron-up"   style="font-size:11px"></i></button>
      <button class="te-row-btn te-row-down" data-id="${t.id}" title="Move down"><i class="ti ti-chevron-down" style="font-size:11px"></i></button>
      <button class="te-row-btn te-row-del"  data-id="${t.id}" title="Delete"><i class="ti ti-trash" style="font-size:11px"></i></button>
    </td>
  </tr>`;
}

// A deliverable — child of a task. Rendered as a de-emphasised sub-row with a
// package icon. Only the name is editable inline.
function delivRowHTML(d) {
  const parentIndent = wbsDepthOf(d.wbs || '') * 14;
  return `<tr class="te-row te-row-deliverable">
    <td></td>
    <td>
      <div class="te-name-cell" style="padding-left:${parentIndent + 26}px">
        <i class="ti ti-package" style="font-size:12px;color:#1D9E75"></i>
        <input class="te-in te-name-in" data-id="${d.id}" data-field="name" value="${escapeAttr(d.name || '')}" placeholder="Deliverable name" style="font-weight:400">
      </div>
    </td>
    <td colspan="8" style="color:#C4C9D4;font-size:11px;padding-left:12px">Deliverable</td>
    <td style="white-space:nowrap;text-align:right">
      <button class="te-row-btn te-row-up"  data-id="${d.id}" title="Move up"><i class="ti ti-chevron-up"   style="font-size:11px"></i></button>
      <button class="te-row-btn te-row-down" data-id="${d.id}" title="Move down"><i class="ti ti-chevron-down" style="font-size:11px"></i></button>
      <button class="te-row-btn te-row-del"  data-id="${d.id}" title="Delete"><i class="ti ti-trash" style="font-size:11px"></i></button>
    </td>
  </tr>`;
}

// Migration: old flat template_tasks → hierarchical (phases + tasks + deliverables).
// Runs once on editor open when no phase-type rows exist yet.
async function migrateFlatToHierarchy(templateId, allRows, db) {
  // Group by phase text, preserving first-seen order (which mirrors sort_order).
  const phaseNames = [];
  const seenPhases = new Set();
  const sorted = allRows.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  sorted.forEach(r => {
    const p = r.phase || '(No phase)';
    if (!seenPhases.has(p)) { seenPhases.add(p); phaseNames.push(p); }
  });

  // Pre-generate phase IDs so tasks can reference them without waiting.
  const phaseIds = new Map(phaseNames.map(name => [name, crypto.randomUUID()]));

  // Round 1: create phase rows
  await Promise.all(phaseNames.map((name, i) => db.insertAwait('template_tasks', {
    id:          phaseIds.get(name),
    template_id: templateId,
    parent_id:   null,
    type:        'phase',
    name,
    phase:       name,
    sort_order:  (i + 1) * 10000,
  })));

  // Round 2: reparent existing tasks and set their type
  await Promise.all(sorted.map(t => db.updateAwait('template_tasks', t.id, {
    parent_id: phaseIds.get(t.phase || '(No phase)'),
    type:      t.is_milestone ? 'milestone' : 'task',
  })));

  // Round 3: create deliverable rows from primary_deliverable text
  const withDelivs = sorted.filter(t => t.primary_deliverable && String(t.primary_deliverable).trim());
  await Promise.all(withDelivs.map(t => db.insertAwait('template_tasks', {
    template_id: templateId,
    parent_id:   t.id,
    type:        'deliverable',
    name:        t.primary_deliverable,
    sort_order:  100,
  })));
}

function wbsDepthOf(wbs) {
  if (!wbs) return 0;
  const parts = String(wbs).split('.').filter(Boolean);
  return Math.max(0, parts.length - 2);   // 1 → 0, 1.1 → 0, 1.1.1 → 1, etc.
}

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
