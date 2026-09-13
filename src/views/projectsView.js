// projectsView.js — projects overview page.
// Shows all projects as cards with stats, progress and team.
// This is the home screen — shown when no project is selected.

const TODAY = new Date(2026, 8, 13);
const STATUS_CFG = {
  active:   { label:'Active',   color:'#1D9E75' },
  'on-hold':{ label:'On hold',  color:'#BA7517' },
  closed:   { label:'Closed',   color:'#A0A7B4' },
};

const av = (p, sz=26) => p
  ? `<span title="${p.name}" style="display:inline-flex;width:${sz}px;height:${sz}px;border-radius:50%;
      background:${p.color};align-items:center;justify-content:center;font-size:${Math.round(sz*.38)}px;
      font-weight:500;color:#fff;flex-shrink:0;border:2px solid #fff">${p.initials}</span>`
  : '';

export function renderProjects({ mount, projects, allTasks, people, deliverables, onSelect, onCreate }) {

  function statsForProject(projId) {
    const tasks  = allTasks.filter(t =>
      t.project_id === projId &&
      !['phase','agenda','followup'].includes(t.type));
    const total   = tasks.length;
    const done    = tasks.filter(t => t.status === 'done').length;
    const overdue = tasks.filter(t => {
      const d = t.end_date ? new Date(t.end_date + 'T00:00:00') : null;
      return !!d && d < TODAY && t.status !== 'done';
    }).length;
    const blocked = tasks.filter(t => t.status === 'blocked').length;
    const pct     = total ? Math.round((done / total) * 100) : 0;

    // unique owners (up to 4 avatars)
    const ownerIds = [...new Set(tasks.map(t => t.owner_id).filter(Boolean))].slice(0, 4);
    const owners   = ownerIds.map(id => people.find(p => p.id === id)).filter(Boolean);

    // latest due date across open tasks
    const dueDates = tasks
      .filter(t => t.end_date && t.status !== 'done')
      .map(t => t.end_date).sort();
    const nextDue = dueDates[0] || null;

    // deliverable count
    const dlCount = deliverables.filter(d => d.project_id === projId).length;

    return { total, done, overdue, blocked, pct, owners, nextDue, dlCount };
  }

  const sorted = [...projects].sort((a, b) => {
    // active first, then by name
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return  1;
    return a.name.localeCompare(b.name);
  });

  const cardHTML = proj => {
    const st = STATUS_CFG[proj.status] || STATUS_CFG.active;
    const s  = statsForProject(proj.id);
    const barColor = s.pct === 100 ? '#1D9E75' : '#534AB7';

    return `<div class="proj-card" data-proj="${proj.id}" tabindex="0">
      <div class="proj-card-top">
        <div style="flex:1;min-width:0">
          <div class="proj-name">${proj.name}</div>
          ${proj.client_org ? `<div class="proj-client">${proj.client_org}</div>` : ''}
        </div>
        <span class="proj-status-badge" style="background:${st.color}1a;color:${st.color}">${st.label}</span>
      </div>

      <div class="proj-prog-wrap">
        <div class="proj-prog-bar">
          <div class="proj-prog-fill" style="width:${s.pct}%;background:${barColor}"></div>
        </div>
        <span class="proj-pct">${s.pct}%</span>
      </div>

      <div class="proj-stats-row">
        <span class="proj-stat-chip">${s.total} task${s.total===1?'':'s'}</span>
        ${s.dlCount ? `<span class="proj-stat-chip"><i class="ti ti-package" style="font-size:10px"></i> ${s.dlCount} deliverable${s.dlCount===1?'':'s'}</span>` : ''}
        ${s.overdue ? `<span class="proj-stat-chip danger"><i class="ti ti-alert-triangle" style="font-size:10px"></i> ${s.overdue} overdue</span>` : ''}
        ${s.blocked && !s.overdue ? `<span class="proj-stat-chip warn"><i class="ti ti-ban" style="font-size:10px"></i> ${s.blocked} blocked</span>` : ''}
      </div>

      <div class="proj-card-foot">
        <div class="proj-avs">
          ${s.owners.map(p => av(p)).join('')}
          ${s.owners.length === 0 ? '<span style="font-size:11px;color:#C4C9D4">No team</span>' : ''}
        </div>
        ${s.nextDue
          ? `<span class="proj-due ${s.overdue ? 'over' : ''}">
               <i class="ti ti-calendar" style="font-size:11px"></i>
               ${new Date(s.nextDue+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
             </span>`
          : s.total === 0 ? '<span style="font-size:11px;color:#C4C9D4">No tasks yet</span>' : ''}
      </div>
    </div>`;
  };

  const newCard = `
    <div class="proj-card new-card" id="newProjCard" tabindex="0">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  height:100%;gap:12px;min-height:160px;color:#C4C9D4">
        <div style="width:40px;height:40px;border-radius:10px;border:1.5px dashed #D1D5DB;
                    display:flex;align-items:center;justify-content:center;font-size:20px">+</div>
        <span style="font-size:13px;color:#9CA3AF">New project</span>
      </div>
    </div>`;

  mount.innerHTML = `
    <div style="flex:1;overflow-y:auto;background:#F8F9FB;padding:32px 40px 60px">
      <div style="max-width:1100px;margin:0 auto">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px">
          <div>
            <div style="font-size:22px;font-weight:500;color:#1A1A22">Projects</div>
            <div style="font-size:13px;color:#9CA3AF;margin-top:2px">${projects.length} project${projects.length===1?'':'s'}</div>
          </div>
          <button id="newProjBtn" class="btn" style="height:36px;padding:0 18px;font-size:13px">
            <i class="ti ti-plus" style="font-size:12px"></i>New project</button>
        </div>
        <div class="proj-grid">
          ${sorted.map(cardHTML).join('')}
          ${newCard}
        </div>
      </div>
    </div>`;

  mount.querySelectorAll('.proj-card:not(.new-card)').forEach(card => {
    card.addEventListener('click', () => onSelect(card.dataset.proj));
    card.addEventListener('keydown', e => { if(e.key==='Enter') onSelect(card.dataset.proj); });
  });
  document.getElementById('newProjBtn')?.addEventListener('click', onCreate);
  document.getElementById('newProjCard')?.addEventListener('click', onCreate);
}
