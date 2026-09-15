// templateEditView.js — Template plan editor.
//
// Renders a header (back button, editable name and description, stats) and
// hands the actual plan grid off to renderTemplateGrid — which is the same
// engine that powers the project plan, just configured for template_tasks.
// That's why the template plan has full feature parity with the project plan:
// same drag-and-drop, right-click menu, column show/hide/reorder/resize,
// wrap toggle, multi-select, bulk action bar, indent/outdent on Tab, Enter
// to add a new row.
//
// Before rendering, the editor auto-migrates two legacy states so old
// templates keep working:
//   1. Flat template_tasks (no phase rows) → create phase rows, reparent
//      tasks, extract primary_deliverable text into deliverable child rows.
//   2. Phase rows without a WBS → backfill from their first child's leading
//      WBS segment (e.g. children with "1.1", "1.2" produce phase WBS "1").
// Both are idempotent, so re-opening a template that's already migrated is a
// no-op.

import { renderTemplateGrid } from './gridView.js';

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
    mount.innerHTML = `<div class="tep-wrap"><div class="tep-migrating">
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

  const totalTasks  = allRows.filter(r => r.type === 'task' || r.type === 'milestone').length;
  const totalPhases = allRows.filter(r => r.type === 'phase').length;

  // ── Render header + mount point for the grid ─────────────────────
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
      <div id="tepGridMount" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>
    </div>
  `;

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

  // Hand the grid off to the shared engine.
  renderTemplateGrid({
    mount: mount.querySelector('#tepGridMount'),
    records: allRows,
    templateId,
    db,
    onRerender,
  });
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

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
