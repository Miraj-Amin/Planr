// templateEditView.js — Open a template as an editable plan.
//
// Templates aren't projects — no live dates, no real people, no dependencies wired up.
// So the columns are template-native: WBS, Task, Workstream, Deliverable, Milestone,
// Owner (role), Accountable (role), Duration (workdays), Start offset (workdays),
// Predecessor, Acceptance criteria. Everything grouped by phase, everything inline-editable.
// Any change persists straight to Supabase via db.update, so this is safe to leave open.

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

export function renderTemplateEdit({ mount, templateId, templates, template_tasks, db, onBack, onRerender }) {
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

  const allTasks = (template_tasks || []).filter(t => t.template_id === templateId);

  // Group by phase, preserving first-seen order (which mirrors sort_order).
  const seen = new Map();
  allTasks.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .forEach(t => {
      const k = t.phase || '(No phase)';
      if (!seen.has(k)) seen.set(k, []);
      seen.get(k).push(t);
    });
  const groups = [...seen.entries()].map(([name, tasks]) => ({ name, tasks }));

  const collapsedKey = `planr_tpl_collapsed_${templateId}`;
  let collapsed = new Set();
  try { collapsed = new Set(JSON.parse(localStorage.getItem(collapsedKey) || '[]')); } catch (e) {}
  const persistCollapsed = () => { try { localStorage.setItem(collapsedKey, JSON.stringify([...collapsed])); } catch (e) {} };

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
          <div class="te-stat"><b>${allTasks.length}</b><span>tasks</span></div>
          <div class="te-stat"><b>${groups.length}</b><span>phases</span></div>
        </div>
      </div>

      <div class="te-body">
        ${groups.length === 0
          ? `<div class="te-empty-inline">This template has no tasks yet. Add a phase to start.</div>`
          : groups.map(g => phaseHTML(g, collapsed.has(g.name))).join('')}
        <div class="te-add-phase-wrap">
          <button class="te-add-phase-btn" id="teAddPhase">
            <i class="ti ti-plus" style="font-size:12px"></i>Add phase
          </button>
        </div>
      </div>
    </div>
  `;

  // ── Back ────────────────────────────────────────────────────────
  mount.querySelector('#teBack')?.addEventListener('click', onBack);

  // ── Template header edits ───────────────────────────────────────
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

  // ── Phase collapse toggle ───────────────────────────────────────
  mount.querySelectorAll('.te-phase-collapse').forEach(btn => {
    btn.addEventListener('click', () => {
      const phase = btn.dataset.phase;
      if (collapsed.has(phase)) collapsed.delete(phase); else collapsed.add(phase);
      persistCollapsed();
      onRerender();
    });
  });

  // ── Rename phase (updates every row with that phase) ────────────
  mount.querySelectorAll('.te-phase-rename').forEach(inp => {
    const original = inp.dataset.phase;
    inp.addEventListener('blur', () => {
      const newName = inp.value.trim();
      if (!newName) { inp.value = original; return; }
      if (newName === original) return;
      allTasks.filter(t => (t.phase || '(No phase)') === original)
        .forEach(t => db.update('template_tasks', t.id, { phase: newName }));
      if (collapsed.has(original)) { collapsed.delete(original); collapsed.add(newName); persistCollapsed(); }
      onRerender();
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });

  // ── Delete phase ────────────────────────────────────────────────
  mount.querySelectorAll('.te-phase-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const phase = btn.dataset.phase;
      const rows = allTasks.filter(t => (t.phase || '(No phase)') === phase);
      if (!confirm(`Delete phase "${phase}" and its ${rows.length} task${rows.length === 1 ? '' : 's'}?`)) return;
      rows.forEach(r => db.remove('template_tasks', r.id));
      collapsed.delete(phase); persistCollapsed();
      onRerender();
    });
  });

  // ── Add task inside a phase ─────────────────────────────────────
  mount.querySelectorAll('.te-phase-addtask').forEach(btn => {
    btn.addEventListener('click', () => {
      const phase = btn.dataset.phase;
      const rows = allTasks.filter(t => (t.phase || '(No phase)') === phase);
      const maxSort = rows.length ? Math.max(...rows.map(r => r.sort_order || 0)) : 0;
      db.insert('template_tasks', {
        template_id:            templateId,
        phase:                  phase === '(No phase)' ? null : phase,
        name:                   '',
        duration_workdays:      1,
        start_offset_workdays:  0,
        is_milestone:           false,
        sort_order:             maxSort + 100,
      });
      onRerender();
    });
  });

  // ── Add phase ───────────────────────────────────────────────────
  mount.querySelector('#teAddPhase')?.addEventListener('click', () => {
    const name = prompt('Phase name:');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const maxSort = allTasks.length ? Math.max(...allTasks.map(t => t.sort_order || 0)) : 0;
    db.insert('template_tasks', {
      template_id:            templateId,
      phase:                  trimmed,
      name:                   'New task',
      duration_workdays:      1,
      start_offset_workdays:  0,
      is_milestone:           false,
      sort_order:             maxSort + 1000,
    });
    onRerender();
  });

  // ── Inline task edits ───────────────────────────────────────────
  mount.querySelectorAll('.te-in').forEach(el => {
    const commit = () => {
      const id = el.dataset.id;
      const field = el.dataset.field;
      const cur = db.get('template_tasks', id);
      if (!cur) return;
      let val;
      if (el.type === 'checkbox') {
        val = el.checked;
      } else if (el.type === 'number') {
        const raw = el.value.trim();
        val = raw === '' ? null : parseInt(raw, 10);
        if (!Number.isFinite(val)) val = null;
      } else {
        val = el.value.trim() || null;
      }
      if ((cur[field] ?? null) !== (val ?? null)) db.update('template_tasks', id, { [field]: val });
    };
    if (el.type === 'checkbox') el.addEventListener('change', commit);
    else                        el.addEventListener('blur', commit);
  });

  // ── Delete task ─────────────────────────────────────────────────
  mount.querySelectorAll('.te-task-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (confirm('Delete this task?')) {
        db.remove('template_tasks', id);
        onRerender();
      }
    });
  });

  // ── Reorder rows within a phase ─────────────────────────────────
  mount.querySelectorAll('.te-task-up, .te-task-down').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const dir = btn.classList.contains('te-task-up') ? -1 : 1;
      const task = allTasks.find(t => t.id === id);
      if (!task) return;
      const siblings = allTasks
        .filter(t => (t.phase || '(No phase)') === (task.phase || '(No phase)'))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const idx = siblings.findIndex(s => s.id === id);
      const swap = siblings[idx + dir];
      if (!swap) return;
      const a = task.sort_order || 0;
      const b = swap.sort_order || 0;
      db.update('template_tasks', task.id, { sort_order: b });
      db.update('template_tasks', swap.id, { sort_order: a });
      onRerender();
    });
  });
}

// ─── Phase block HTML ─────────────────────────────────────────────
function phaseHTML(g, isCollapsed) {
  const color = PHASE_COLORS[g.name] || '#9CA3AF';
  return `
    <div class="te-phase">
      <div class="te-phase-head" style="border-left:3px solid ${color}">
        <button class="te-phase-collapse" data-phase="${escapeAttr(g.name)}">
          <i class="ti ${isCollapsed ? 'ti-chevron-right' : 'ti-chevron-down'}" style="font-size:12px"></i>
        </button>
        <input class="te-phase-rename" data-phase="${escapeAttr(g.name)}" value="${escapeAttr(g.name)}">
        <span class="te-phase-count">${g.tasks.length}</span>
        <div style="flex:1"></div>
        <button class="te-phase-addtask" data-phase="${escapeAttr(g.name)}" title="Add task in this phase">
          <i class="ti ti-plus" style="font-size:12px"></i>
        </button>
        <button class="te-phase-del" data-phase="${escapeAttr(g.name)}" title="Delete phase">
          <i class="ti ti-trash" style="font-size:12px"></i>
        </button>
      </div>
      ${isCollapsed ? '' : `
        <div class="te-table-scroll">
          <table class="te-table">
            <thead>
              <tr>
                <th style="width:64px">WBS</th>
                <th style="min-width:220px">Task</th>
                <th style="width:130px">Workstream</th>
                <th style="min-width:160px">Deliverable</th>
                <th style="width:34px" title="Milestone">M</th>
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
              ${g.tasks.map(t => taskRowHTML(t)).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function taskRowHTML(t) {
  const numCSS = 'font-family:JetBrains Mono, monospace;font-size:11px;text-align:center';
  return `<tr class="te-row">
    <td><input class="te-in" data-id="${t.id}" data-field="wbs" value="${escapeAttr(t.wbs || '')}" style="font-family:JetBrains Mono, monospace;font-size:11px"></td>
    <td><input class="te-in" data-id="${t.id}" data-field="name" value="${escapeAttr(t.name || '')}" placeholder="Task name" style="font-weight:500"></td>
    <td><input class="te-in" data-id="${t.id}" data-field="workstream" value="${escapeAttr(t.workstream || '')}"></td>
    <td><input class="te-in" data-id="${t.id}" data-field="primary_deliverable" value="${escapeAttr(t.primary_deliverable || '')}"></td>
    <td style="text-align:center"><input type="checkbox" class="te-in te-check" data-id="${t.id}" data-field="is_milestone" ${t.is_milestone ? 'checked' : ''}></td>
    <td><input class="te-in" data-id="${t.id}" data-field="owner_role" value="${escapeAttr(t.owner_role || '')}" placeholder="e.g. Project Manager"></td>
    <td><input class="te-in" data-id="${t.id}" data-field="accountable_role" value="${escapeAttr(t.accountable_role || '')}"></td>
    <td><input class="te-in" type="number" min="0" data-id="${t.id}" data-field="duration_workdays" value="${t.duration_workdays ?? ''}" style="${numCSS}"></td>
    <td><input class="te-in" type="number" min="0" data-id="${t.id}" data-field="start_offset_workdays" value="${t.start_offset_workdays ?? ''}" style="${numCSS}"></td>
    <td><input class="te-in" data-id="${t.id}" data-field="predecessor_wbs" value="${escapeAttr(t.predecessor_wbs || '')}" style="font-family:JetBrains Mono, monospace;font-size:11px"></td>
    <td><input class="te-in" data-id="${t.id}" data-field="acceptance_criteria" value="${escapeAttr(t.acceptance_criteria || '')}" placeholder="What does done look like?"></td>
    <td><input class="te-in" data-id="${t.id}" data-field="key_dependency" value="${escapeAttr(t.key_dependency || '')}"></td>
    <td style="white-space:nowrap;text-align:right">
      <button class="te-row-btn te-task-up"   data-id="${t.id}" title="Move up"><i class="ti ti-chevron-up"   style="font-size:11px"></i></button>
      <button class="te-row-btn te-task-down" data-id="${t.id}" title="Move down"><i class="ti ti-chevron-down" style="font-size:11px"></i></button>
      <button class="te-row-btn te-task-del"  data-id="${t.id}" title="Delete"><i class="ti ti-trash" style="font-size:11px"></i></button>
    </td>
  </tr>`;
}

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
