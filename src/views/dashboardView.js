// dashboardView.js — Project dashboard (per project) and portfolio dashboard (all projects).
//
// Pass projectId=null to render the portfolio view. Both share the tile layout and colour scheme.

const RAG_COLOR    = { green:'#1D9E75', amber:'#BA7517', red:'#E24B4A', blue:'#378ADD' };
const STATUS_COLOR = { open:'#BA7517', monitoring:'#7F77DD', closed:'#1D9E75', accepted:'#6B7280' };

export function renderDashboard({ mount, projectId, tasks, projects, risks, deliverables, people }) {
  if (projectId) {
    renderProjectDashboard(mount, projectId, tasks, projects, risks, deliverables, people);
  } else {
    renderPortfolioDashboard(mount, tasks, projects, risks, deliverables, people);
  }
}

// ─── Per-project dashboard ─────────────────────────────────────────────
function renderProjectDashboard(mount, projectId, allTasks, projects, allRisks, allDelivs, people) {
  const proj  = projects.find(p => p.id === projectId);
  const ts    = allTasks.filter(t => t.project_id === projectId &&
    !['agenda','action','followup','meeting'].includes(t.type));
  const rks   = allRisks.filter(r => r.project_id === projectId);
  const dls   = allDelivs.filter(d => d.project_id === projectId);

  const activeTs = ts.filter(t => t.type !== 'phase');
  const done     = activeTs.filter(t => t.status === 'done').length;
  const blocked  = activeTs.filter(t => t.status === 'blocked').length;
  const inProg   = activeTs.filter(t => t.status === 'in-progress').length;
  const pctDone  = activeTs.length ? Math.round((done / activeTs.length) * 100) : 0;

  const today = new Date(); today.setHours(0,0,0,0);
  const overdue = activeTs.filter(t => t.end_date && new Date(t.end_date) < today && t.status !== 'done').length;
  const upcoming = activeTs
    .filter(t => t.end_date && t.status !== 'done')
    .filter(t => {
      const d = new Date(t.end_date);
      const days = (d - today) / 86400000;
      return days >= 0 && days <= 14;
    })
    .sort((a, b) => new Date(a.end_date) - new Date(b.end_date))
    .slice(0, 6);

  const milestones = ts.filter(t => t.is_milestone || t.type === 'milestone')
    .sort((a, b) => (a.end_date || '').localeCompare(b.end_date || ''));

  const ragCount = { green: 0, amber: 0, red: 0, blue: 0 };
  rks.forEach(r => { if (ragCount[r.rag] != null) ragCount[r.rag]++; });
  const openRisks = rks.filter(r => r.status === 'open').length;
  const highSev = rks.filter(r => ['high','critical'].includes(r.severity) && r.status === 'open').length;

  const delivsDone = dls.filter(d => d.status === 'complete' || d.status === 'done').length;

  mount.innerHTML = `
    <div class="dash-wrap">
      <div class="dash-hero">
        <div>
          <div class="dash-hero-name">${escapeHtml(proj?.name || 'Project')}</div>
          <div class="dash-hero-sub">${escapeHtml(proj?.client_org || '')}${proj?.delivery_method ? ` · ${escapeHtml(proj.delivery_method)}` : ''}</div>
        </div>
        <div class="dash-hero-stats">
          <div class="dash-hero-progress">
            <svg width="60" height="60" viewBox="0 0 60 60">
              <circle cx="30" cy="30" r="26" fill="none" stroke="rgba(0,0,0,.06)" stroke-width="6"/>
              <circle cx="30" cy="30" r="26" fill="none" stroke="#534AB7" stroke-width="6"
                stroke-dasharray="${(pctDone / 100) * 163.36} 163.36" transform="rotate(-90 30 30)" stroke-linecap="round"/>
              <text x="30" y="34" text-anchor="middle" font-size="14" font-weight="600" fill="#1A1A22">${pctDone}%</text>
            </svg>
            <div>
              <div class="dash-hero-pct-l">Complete</div>
              <div class="dash-hero-pct-sub">${done} of ${activeTs.length} tasks</div>
            </div>
          </div>
        </div>
      </div>

      <div class="dash-grid">
        ${tileHTML('ti-list-check',   'Tasks',       `${activeTs.length}`,    `${inProg} in progress`, '#7F77DD')}
        ${tileHTML('ti-lock',         'Blocked',     `${blocked}`,             blocked ? 'Needs attention' : 'Clear', blocked ? '#E24B4A' : '#1D9E75')}
        ${tileHTML('ti-alert-circle', 'Overdue',     `${overdue}`,             overdue ? 'Past due date' : 'On track', overdue ? '#E24B4A' : '#1D9E75')}
        ${tileHTML('ti-flag',         'Risks (open)',`${openRisks}`,           `${highSev} high/critical`, highSev ? '#E24B4A' : '#BA7517')}
        ${tileHTML('ti-diamond',      'Milestones',  `${milestones.length}`,   `${milestones.filter(m => m.status === 'done').length} achieved`, '#BA7517')}
        ${tileHTML('ti-package',      'Deliverables',`${dls.length}`,          `${delivsDone} complete`, '#1D9E75')}
      </div>

      <div class="dash-row">
        <div class="dash-panel" style="flex:1">
          <div class="dash-panel-h">Upcoming (next 14 days)</div>
          ${upcoming.length ? upcoming.map(t => {
            const owner = people.find(p => p.id === t.owner_id);
            const d = new Date(t.end_date);
            const days = Math.round((d - today) / 86400000);
            const lbl = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
            return `<div class="dash-item">
              <div class="dash-item-name">${escapeHtml(t.name || 'Untitled')}</div>
              ${owner ? `<div class="av" style="background:${owner.color};width:20px;height:20px;font-size:8px" title="${escapeHtml(owner.name)}">${owner.initials}</div>` : ''}
              <div class="dash-item-date">${lbl}</div>
            </div>`;
          }).join('') : '<div class="dash-empty">Nothing due soon.</div>'}
        </div>

        <div class="dash-panel" style="flex:1">
          <div class="dash-panel-h">RAID summary</div>
          <div class="dash-rag-bars">
            ${['red','amber','green','blue'].map(k => {
              const c = ragCount[k];
              const total = rks.length || 1;
              const pct = Math.round((c / total) * 100);
              return `<div class="dash-rag-row">
                <span class="dash-rag-dot" style="background:${RAG_COLOR[k]}"></span>
                <span class="dash-rag-l">${k.charAt(0).toUpperCase() + k.slice(1)}</span>
                <div class="dash-rag-track"><div style="width:${pct}%;background:${RAG_COLOR[k]}"></div></div>
                <span class="dash-rag-v">${c}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      ${milestones.length ? `
        <div class="dash-panel">
          <div class="dash-panel-h">Milestones</div>
          ${milestones.slice(0, 8).map(m => `
            <div class="dash-item">
              <i class="ti ti-diamond-filled" style="font-size:12px;color:#BA7517"></i>
              <div class="dash-item-name">${escapeHtml(m.name || 'Untitled')}</div>
              <span class="dash-item-badge" style="background:${m.status === 'done' ? 'rgba(29,158,117,.1)' : 'rgba(186,117,23,.1)'};color:${m.status === 'done' ? '#1D9E75' : '#BA7517'}">${m.status || 'pending'}</span>
              <div class="dash-item-date">${m.end_date || '—'}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// ─── Portfolio (all projects) dashboard ─────────────────────────────────
function renderPortfolioDashboard(mount, allTasks, projects, allRisks, allDelivs, people) {
  const active = projects.filter(p => p.status === 'active' || !p.status);

  const rows = active.map(p => {
    const ts = allTasks.filter(t => t.project_id === p.id && !['agenda','action','followup','meeting','phase'].includes(t.type));
    const done = ts.filter(t => t.status === 'done').length;
    const pct = ts.length ? Math.round((done / ts.length) * 100) : 0;
    const rks = allRisks.filter(r => r.project_id === p.id);
    const openRisks = rks.filter(r => r.status === 'open').length;
    const redRisks  = rks.filter(r => r.rag === 'red').length;
    const today = new Date(); today.setHours(0,0,0,0);
    const overdue = ts.filter(t => t.end_date && new Date(t.end_date) < today && t.status !== 'done').length;
    const blocked = ts.filter(t => t.status === 'blocked').length;

    // Portfolio RAG = worst of red risks, blocked tasks, overdue count
    let rag = 'green';
    if (redRisks || blocked || overdue > 3) rag = 'red';
    else if (openRisks > 0 || overdue > 0) rag = 'amber';

    return { p, ts, done, pct, openRisks, redRisks, overdue, blocked, rag };
  });

  const totals = rows.reduce((acc, r) => ({
    tasks: acc.tasks + r.ts.length,
    done:  acc.done + r.done,
    open:  acc.open + r.openRisks,
    red:   acc.red + r.redRisks,
    blocked: acc.blocked + r.blocked,
    overdue: acc.overdue + r.overdue,
  }), { tasks: 0, done: 0, open: 0, red: 0, blocked: 0, overdue: 0 });
  const totalPct = totals.tasks ? Math.round((totals.done / totals.tasks) * 100) : 0;

  const ragCount = { green: 0, amber: 0, red: 0 };
  rows.forEach(r => ragCount[r.rag]++);

  mount.innerHTML = `
    <div class="dash-wrap">
      <div class="dash-portfolio-head">
        <div>
          <div class="dash-hero-name">Portfolio</div>
          <div class="dash-hero-sub">${rows.length} active project${rows.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      <div class="dash-grid">
        ${tileHTML('ti-folder',       'Active projects', `${rows.length}`,        `${projects.length - rows.length} other`, '#534AB7')}
        ${tileHTML('ti-list-check',   'Total tasks',     `${totals.tasks}`,       `${totalPct}% overall complete`, '#7F77DD')}
        ${tileHTML('ti-alert-circle', 'Overdue',         `${totals.overdue}`,     `across all projects`, totals.overdue ? '#E24B4A' : '#1D9E75')}
        ${tileHTML('ti-lock',         'Blocked',         `${totals.blocked}`,     `across all projects`, totals.blocked ? '#E24B4A' : '#1D9E75')}
        ${tileHTML('ti-flag',         'Open risks',      `${totals.open}`,        `${totals.red} red`, totals.red ? '#E24B4A' : '#BA7517')}
        ${tileHTML('ti-shield-check', 'Green projects',  `${ragCount.green}`,     `${ragCount.amber} amber · ${ragCount.red} red`, '#1D9E75')}
      </div>

      <div class="dash-panel">
        <div class="dash-panel-h">Projects</div>
        <table class="dash-portfolio-table">
          <thead>
            <tr>
              <th>Project</th>
              <th style="width:80px">RAG</th>
              <th style="width:170px">Progress</th>
              <th style="width:70px">Tasks</th>
              <th style="width:80px">Overdue</th>
              <th style="width:80px">Blocked</th>
              <th style="width:80px">Risks</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0
              ? '<tr><td colspan="7" style="text-align:center;padding:24px;color:#9CA3AF">No active projects.</td></tr>'
              : rows.map(r => `
                <tr class="dash-portfolio-row" data-project="${r.p.id}">
                  <td>
                    <div class="dash-item-name" style="font-weight:500">${escapeHtml(r.p.name)}</div>
                    ${r.p.client_org ? `<div style="font-size:11px;color:#9CA3AF">${escapeHtml(r.p.client_org)}</div>` : ''}
                  </td>
                  <td><span class="dash-item-badge" style="background:${RAG_COLOR[r.rag]}1a;color:${RAG_COLOR[r.rag]}">${r.rag}</span></td>
                  <td>
                    <div class="dash-progress">
                      <div class="dash-progress-track"><div style="width:${r.pct}%;background:#534AB7"></div></div>
                      <span class="dash-progress-lbl">${r.pct}%</span>
                    </div>
                  </td>
                  <td style="font-family:monospace;font-size:12px">${r.done}/${r.ts.length}</td>
                  <td style="color:${r.overdue ? '#E24B4A' : '#9CA3AF'};font-family:monospace;font-size:12px">${r.overdue}</td>
                  <td style="color:${r.blocked ? '#E24B4A' : '#9CA3AF'};font-family:monospace;font-size:12px">${r.blocked}</td>
                  <td style="color:${r.openRisks ? '#BA7517' : '#9CA3AF'};font-family:monospace;font-size:12px">${r.openRisks}</td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  mount.querySelectorAll('.dash-portfolio-row').forEach(tr => {
    tr.addEventListener('click', () => {
      const pid = tr.dataset.project;
      window.dispatchEvent(new CustomEvent('planr:openProject', { detail: pid }));
    });
  });
}

function tileHTML(icon, label, big, sub, accent) {
  return `<div class="dash-tile">
    <div class="dash-tile-h">
      <span class="dash-tile-icon" style="background:${accent}1a;color:${accent}"><i class="ti ${icon}" style="font-size:14px"></i></span>
      <span class="dash-tile-label">${label}</span>
    </div>
    <div class="dash-tile-big">${big}</div>
    <div class="dash-tile-sub">${sub}</div>
  </div>`;
}
function escapeHtml(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
