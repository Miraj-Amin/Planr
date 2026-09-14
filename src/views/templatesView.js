// templatesView.js — Manage delivery templates and create projects from them.
//
// A template is a re-usable set of phase → task rows. It can be imported from an
// Excel workbook (using the "Comprehensive Software Delivery Project Plan" layout),
// captured from an existing project, or built manually. When you create a project
// from a template you can pick which phases to include, so it doubles as a
// full-plan template or a piecemeal one.

import { parseTemplateWorkbook } from '../lib/excelImport.js';
import { addWorkdays, isoDate }  from '../lib/workdays.js';
import { openModal }             from './modal.js';

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

export function renderTemplates({ mount, templates, template_tasks, projects, people, db, onCreateProject }) {

  const rows = (templates || []).slice().sort((a, b) =>
    (b.created_at || '').localeCompare(a.created_at || ''));

  const countFor = tid => (template_tasks || []).filter(t => t.template_id === tid).length;
  const phasesFor = tid => {
    const set = new Set();
    (template_tasks || []).filter(t => t.template_id === tid).forEach(t => t.phase && set.add(t.phase));
    return [...set];
  };

  mount.innerHTML = `
    <div class="tpl-wrap">
      <div class="tpl-max">
        <div class="tpl-head">
          <div>
            <div class="tpl-title">Templates</div>
            <div class="tpl-sub">Reusable delivery plans. Import from Excel, capture from an existing project, or reuse across new work.</div>
          </div>
          <div style="display:flex;gap:8px">
            <label class="btn" style="height:36px;padding:0 16px;font-size:13px;cursor:pointer">
              <i class="ti ti-file-import" style="font-size:12px"></i>Import Excel
              <input type="file" id="tplXlsxInput" accept=".xlsx,.xls" style="display:none">
            </label>
          </div>
        </div>

        ${rows.length === 0
          ? `<div class="tpl-empty">
              <i class="ti ti-template" style="font-size:32px;color:#C4C9D4;margin-bottom:10px"></i>
              <div style="font-size:14px;color:#374151;margin-bottom:4px">No templates yet</div>
              <div style="font-size:12px;color:#9CA3AF">Upload an Excel plan to create your first template.</div>
            </div>`
          : `<div class="tpl-grid">
              ${rows.map(t => {
                const phases = phasesFor(t.id);
                return `<div class="tpl-card" data-tpl="${t.id}">
                  <div class="tpl-card-head">
                    <div class="tpl-card-name">${t.name || 'Untitled'}</div>
                    <div class="tpl-card-menu-wrap">
                      <button class="tpl-card-menu-btn" data-tpl="${t.id}" title="More">
                        <i class="ti ti-dots" style="font-size:14px"></i>
                      </button>
                    </div>
                  </div>
                  ${t.description ? `<div class="tpl-card-desc">${escapeHtml(t.description)}</div>` : ''}
                  <div class="tpl-card-stats">
                    <span><i class="ti ti-list-check" style="font-size:11px"></i>${countFor(t.id)} tasks</span>
                    <span><i class="ti ti-layers-intersect" style="font-size:11px"></i>${phases.length} phases</span>
                  </div>
                  ${phases.length ? `<div class="tpl-phase-strip">
                    ${phases.slice(0, 6).map(p =>
                      `<span class="tpl-phase-chip" style="background:${(PHASE_COLORS[p] || '#9CA3AF')}1a;color:${PHASE_COLORS[p] || '#9CA3AF'}">${escapeHtml(p)}</span>`
                    ).join('')}
                    ${phases.length > 6 ? `<span class="tpl-phase-chip">+${phases.length - 6}</span>` : ''}
                  </div>` : ''}
                  <div class="tpl-card-actions">
                    <button class="btn tpl-use-btn" data-tpl="${t.id}" style="height:30px;padding:0 12px;font-size:12px;width:100%">
                      <i class="ti ti-plus" style="font-size:11px"></i>New project from this
                    </button>
                  </div>
                </div>`;
              }).join('')}
            </div>`
        }
      </div>
    </div>
  `;

  // ── Excel import ──────────────────────────────────────────────────
  mount.querySelector('#tplXlsxInput')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';   // reset so re-picking same file fires again
    try {
      const parsed = await parseTemplateWorkbook(file);
      openImportPreview(parsed, db, () => window.dispatchEvent(new CustomEvent('planr:rerender')));
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  });

  // ── Delete template ───────────────────────────────────────────────
  mount.querySelectorAll('.tpl-card-menu-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tid = btn.dataset.tpl;
      const t = templates.find(x => x.id === tid);
      if (!t) return;
      if (confirm(`Delete template "${t.name}"?\n\nProjects already created from it are unaffected.`)) {
        // Delete tasks first (in case cascade isn't set up)
        (template_tasks || []).filter(x => x.template_id === tid).forEach(x => db.remove('template_tasks', x.id));
        db.remove('templates', tid);
        window.dispatchEvent(new CustomEvent('planr:rerender'));
      }
    });
  });

  // ── Use template ──────────────────────────────────────────────────
  mount.querySelectorAll('.tpl-use-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tid = btn.dataset.tpl;
      const t = templates.find(x => x.id === tid);
      if (!t) return;
      openCreateFromTemplate(t, template_tasks.filter(x => x.template_id === tid), people, db, onCreateProject);
    });
  });
}

// ─── Import preview + save ────────────────────────────────────────────
function openImportPreview(parsed, db, onDone) {
  // Group by phase for a compact preview
  const byPhase = new Map();
  parsed.tasks.forEach(t => {
    const k = t.phase || '(no phase)';
    if (!byPhase.has(k)) byPhase.set(k, []);
    byPhase.get(k).push(t);
  });

  const modal = document.createElement('div');
  modal.className = 'tpl-modal-wrap';
  modal.innerHTML = `
    <div class="tpl-modal">
      <div class="tpl-modal-head">
        <div class="tpl-modal-title">Import template from Excel</div>
        <button class="tpl-modal-close"><i class="ti ti-x" style="font-size:16px"></i></button>
      </div>
      <div class="tpl-modal-body">
        <div class="tpl-field">
          <label>Template name</label>
          <input type="text" id="tplImportName" value="${escapeAttr(parsed.name)}">
        </div>
        <div class="tpl-field">
          <label>Description <span class="tpl-hint">optional</span></label>
          <input type="text" id="tplImportDesc" value="${escapeAttr(parsed.description || '')}">
        </div>
        <div class="tpl-summary">
          <div class="tpl-summary-stats">
            <span><b>${parsed.tasks.length}</b> tasks</span>
            <span><b>${byPhase.size}</b> phases</span>
            ${parsed.warnings.length ? `<span style="color:#BA7517"><i class="ti ti-alert-triangle" style="font-size:11px"></i>${parsed.warnings.length} warning${parsed.warnings.length>1?'s':''}</span>` : ''}
          </div>
          ${parsed.warnings.length ? `<div class="tpl-warnings">${parsed.warnings.map(w => `<div>· ${escapeHtml(w)}</div>`).join('')}</div>` : ''}
        </div>
        <div class="tpl-phase-list">
          ${[...byPhase.entries()].map(([phase, tasks]) => `
            <div class="tpl-phase-block">
              <div class="tpl-phase-block-head">
                <span class="tpl-phase-dot" style="background:${PHASE_COLORS[phase] || '#9CA3AF'}"></span>
                <span class="tpl-phase-block-name">${escapeHtml(phase)}</span>
                <span class="tpl-phase-block-count">${tasks.length}</span>
              </div>
              <div class="tpl-phase-block-tasks">
                ${tasks.slice(0, 4).map(t => `<div class="tpl-tiny">· ${escapeHtml(t.name)}</div>`).join('')}
                ${tasks.length > 4 ? `<div class="tpl-tiny" style="color:#9CA3AF">+${tasks.length - 4} more…</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="tpl-modal-foot">
        <button class="tpl-btn-ghost" id="tplImportCancel">Cancel</button>
        <button class="btn" id="tplImportSave" style="height:34px;padding:0 16px;font-size:13px">Save template</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('.tpl-modal-close').addEventListener('click', close);
  modal.querySelector('#tplImportCancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  modal.querySelector('#tplImportSave').addEventListener('click', () => {
    const name = modal.querySelector('#tplImportName').value.trim() || parsed.name;
    const desc = modal.querySelector('#tplImportDesc').value.trim();
    const tpl = db.insert('templates', {
      name, description: desc || null,
      source: 'excel_import',
      created_at: new Date().toISOString(),
    });
    parsed.tasks.forEach((t, i) => {
      db.insert('template_tasks', {
        ...t,
        template_id: tpl.id,
        sort_order: (i + 1) * 100,
      });
    });
    close();
    onDone?.();
  });
}

// ─── Create project from template ─────────────────────────────────────
function openCreateFromTemplate(tpl, tplTasks, people, db, onCreateProject) {
  const phases = [...new Set(tplTasks.map(t => t.phase).filter(Boolean))];
  const roleSet = new Set();
  tplTasks.forEach(t => {
    if (t.owner_role)       roleSet.add(t.owner_role);
    if (t.accountable_role) roleSet.add(t.accountable_role);
  });
  const roles = [...roleSet];

  const modal = document.createElement('div');
  modal.className = 'tpl-modal-wrap';
  modal.innerHTML = `
    <div class="tpl-modal">
      <div class="tpl-modal-head">
        <div class="tpl-modal-title">New project from “${escapeHtml(tpl.name)}”</div>
        <button class="tpl-modal-close"><i class="ti ti-x" style="font-size:16px"></i></button>
      </div>
      <div class="tpl-modal-body">
        <div class="tpl-field">
          <label>Project name</label>
          <input type="text" id="cpName" placeholder="e.g. Acme CLM Rollout">
        </div>
        <div class="tpl-field-row">
          <div class="tpl-field" style="flex:1">
            <label>Client / Organisation</label>
            <input type="text" id="cpClient" placeholder="Client">
          </div>
          <div class="tpl-field" style="flex:1">
            <label>Project start date</label>
            <input type="date" id="cpStart" value="${isoDate(nextMonday())}">
          </div>
        </div>

        <div class="tpl-section-head">Include phases</div>
        <div class="tpl-phase-chooser">
          <div style="display:flex;gap:6px;margin-bottom:8px">
            <button type="button" class="tpl-btn-ghost" id="cpPickAll">Select all</button>
            <button type="button" class="tpl-btn-ghost" id="cpPickNone">Select none</button>
          </div>
          ${phases.map(p => {
            const count = tplTasks.filter(t => t.phase === p).length;
            return `<label class="tpl-phase-check">
              <input type="checkbox" class="cpPhase" data-phase="${escapeAttr(p)}" checked>
              <span class="tpl-phase-dot" style="background:${PHASE_COLORS[p] || '#9CA3AF'}"></span>
              <span style="flex:1">${escapeHtml(p)}</span>
              <span class="tpl-phase-block-count">${count}</span>
            </label>`;
          }).join('')}
        </div>

        ${roles.length ? `
          <div class="tpl-section-head">Map roles to people <span class="tpl-hint">optional</span></div>
          <div class="tpl-role-map">
            ${roles.map(r => `
              <div class="tpl-role-row">
                <div class="tpl-role-name">${escapeHtml(r)}</div>
                <select class="cpRole" data-role="${escapeAttr(r)}">
                  <option value="">— Leave unassigned —</option>
                  ${people.filter(p => !p.is_client).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
                </select>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
      <div class="tpl-modal-foot">
        <button class="tpl-btn-ghost" id="cpCancel">Cancel</button>
        <button class="btn" id="cpCreate" style="height:34px;padding:0 16px;font-size:13px">Create project</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('.tpl-modal-close').addEventListener('click', close);
  modal.querySelector('#cpCancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  modal.querySelector('#cpPickAll').addEventListener('click', () =>
    modal.querySelectorAll('.cpPhase').forEach(cb => cb.checked = true));
  modal.querySelector('#cpPickNone').addEventListener('click', () =>
    modal.querySelectorAll('.cpPhase').forEach(cb => cb.checked = false));

  modal.querySelector('#cpCreate').addEventListener('click', () => {
    const name = modal.querySelector('#cpName').value.trim();
    if (!name) { alert('Give the project a name first.'); return; }
    const client = modal.querySelector('#cpClient').value.trim() || null;
    const startVal = modal.querySelector('#cpStart').value;
    const start = startVal ? new Date(startVal + 'T00:00:00') : new Date();
    const selectedPhases = new Set(
      [...modal.querySelectorAll('.cpPhase:checked')].map(cb => cb.dataset.phase)
    );
    const roleMap = {};
    modal.querySelectorAll('.cpRole').forEach(sel => {
      if (sel.value) roleMap[sel.dataset.role] = sel.value;
    });

    const tasksToUse = tplTasks.filter(t => !t.phase || selectedPhases.has(t.phase));
    if (!tasksToUse.length) { alert('Pick at least one phase.'); return; }

    onCreateProject({
      name, client_org: client, startDate: start,
      tasks: tasksToUse, roleMap,
      sourceTemplate: tpl,
    });
    close();
  });
}

function nextMonday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const add = dow === 0 ? 1 : (dow === 6 ? 2 : (8 - dow) % 7 || 7);
  d.setDate(d.getDate() + add);
  return d;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
