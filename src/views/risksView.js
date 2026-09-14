// risksView.js — RAID log grid. Inline-editable list of Risks/Issues/Assumptions/Dependencies.

const TYPES        = [['risk','Risk'],['issue','Issue'],['assumption','Assumption'],['dependency','Dependency']];
const STATUSES     = [['open','Open'],['monitoring','Monitoring'],['closed','Closed'],['accepted','Accepted']];
const SEV_LEVELS   = [['low','Low'],['medium','Medium'],['high','High'],['critical','Critical']];
const RAG         = [['green','Green'],['amber','Amber'],['red','Red'],['blue','Blue']];
const TYPE_COLOR   = { risk:'#E24B4A', issue:'#BA7517', assumption:'#7F77DD', dependency:'#378ADD' };
const STATUS_COLOR = { open:'#BA7517', monitoring:'#7F77DD', closed:'#1D9E75', accepted:'#6B7280' };
const RAG_COLOR    = { green:'#1D9E75', amber:'#BA7517', red:'#E24B4A', blue:'#378ADD' };

export function renderRisks({ mount, risks, people, projectId, project, db, onRerender }) {

  const rows = risks.filter(r => r.project_id === projectId).sort((a, b) =>
    (a.sort_order || 0) - (b.sort_order || 0));

  const nextCode = () => {
    const existing = rows.map(r => r.code).filter(Boolean);
    let n = existing.length + 1;
    while (existing.includes(`RAID-${String(n).padStart(3, '0')}`)) n++;
    return `RAID-${String(n).padStart(3, '0')}`;
  };
  const nextSort = () => (rows.length ? Math.max(...rows.map(r => r.sort_order || 0)) + 100 : 100);

  const stats = {
    total: rows.length,
    open: rows.filter(r => r.status === 'open').length,
    red:  rows.filter(r => r.rag === 'red').length,
    high: rows.filter(r => ['high','critical'].includes(r.severity)).length,
  };

  mount.innerHTML = `
    <div class="raid-wrap">
      <div class="raid-banner">
        <div class="raid-stat"><span class="raid-stat-l">Total</span><span class="raid-stat-v">${stats.total}</span></div>
        <div class="raid-stat"><span class="raid-stat-l">Open</span><span class="raid-stat-v" style="color:#BA7517">${stats.open}</span></div>
        <div class="raid-stat"><span class="raid-stat-l">Red</span><span class="raid-stat-v" style="color:#E24B4A">${stats.red}</span></div>
        <div class="raid-stat"><span class="raid-stat-l">High/Critical severity</span><span class="raid-stat-v" style="color:#E24B4A">${stats.high}</span></div>
        <button class="btn" id="raidAdd" style="margin-left:auto;height:32px;padding:0 14px;font-size:12px">
          <i class="ti ti-plus" style="font-size:11px"></i>New item
        </button>
      </div>

      <div class="raid-scroll">
        <table class="raid-table">
          <thead>
            <tr>
              <th style="width:88px">ID</th>
              <th style="width:104px">Type</th>
              <th>Description</th>
              <th style="width:150px">Owner</th>
              <th style="width:110px">Severity</th>
              <th style="width:80px">RAG</th>
              <th>Mitigation / Resolution</th>
              <th style="width:120px">Target date</th>
              <th style="width:120px">Status</th>
              <th style="width:36px"></th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0
              ? `<tr><td colspan="10" style="text-align:center;padding:36px;color:#9CA3AF;font-size:12px">No entries yet. Click <b>New item</b> to add one.</td></tr>`
              : rows.map(r => rowHTML(r, people)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Add row
  mount.querySelector('#raidAdd').addEventListener('click', () => {
    db.insert('risks', {
      project_id: projectId,
      code: nextCode(),
      type: 'risk',
      description: '',
      probability: 'medium',
      severity: 'medium',
      rag: 'green',
      status: 'open',
      date_raised: isoDate(new Date()),
      sort_order: nextSort(),
      created_at: new Date().toISOString(),
    });
    onRerender();
  });

  // Inline edits — all fields, blur to save
  mount.querySelectorAll('.raid-in').forEach(el => {
    const commit = () => {
      const id = el.dataset.id;
      const field = el.dataset.field;
      const v = el.tagName === 'SELECT' ? el.value : el.value.trim();
      const cur = db.get('risks', id);
      if (!cur) return;
      let val = v || null;
      if (field === 'date_raised' || field === 'target_date' || field === 'date_closed') {
        val = v || null;
      }
      if ((cur[field] || null) !== val) {
        const patch = { [field]: val };
        // Auto-set date_closed when status flips to closed
        if (field === 'status' && v === 'closed' && !cur.date_closed) patch.date_closed = isoDate(new Date());
        if (field === 'status' && v !== 'closed' && cur.date_closed)  patch.date_closed = null;
        db.update('risks', id, patch);
      }
    };
    if (el.tagName === 'SELECT') el.addEventListener('change', () => { commit(); onRerender(); });
    else el.addEventListener('blur', commit);
  });

  // Delete
  mount.querySelectorAll('.raid-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (confirm('Delete this RAID item?')) {
        db.remove('risks', id);
        onRerender();
      }
    });
  });
}

function rowHTML(r, people) {
  const owner = people.find(p => p.id === r.owner_id);
  const optionsHTML = (opts, val) => opts.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`).join('');
  return `<tr class="raid-row">
    <td>
      <input class="raid-in" data-id="${r.id}" data-field="code" value="${escapeAttr(r.code || '')}" style="font-family:monospace;font-size:11px">
    </td>
    <td>
      <select class="raid-in raid-chip" data-id="${r.id}" data-field="type"
              style="background:${TYPE_COLOR[r.type] || '#9CA3AF'}1a;color:${TYPE_COLOR[r.type] || '#9CA3AF'};font-weight:500">
        ${optionsHTML(TYPES, r.type)}
      </select>
    </td>
    <td>
      <input class="raid-in" data-id="${r.id}" data-field="description" value="${escapeAttr(r.description || '')}" placeholder="What's the risk / issue?">
    </td>
    <td>
      <select class="raid-in" data-id="${r.id}" data-field="owner_id">
        <option value="">Unassigned</option>
        ${people.map(p => `<option value="${p.id}" ${p.id === r.owner_id ? 'selected' : ''}>${escapeHtml(p.name)}${p.is_client ? ' (client)' : ''}</option>`).join('')}
      </select>
    </td>
    <td>
      <select class="raid-in" data-id="${r.id}" data-field="severity">
        ${optionsHTML(SEV_LEVELS, r.severity)}
      </select>
    </td>
    <td>
      <select class="raid-in raid-chip" data-id="${r.id}" data-field="rag"
              style="background:${RAG_COLOR[r.rag] || '#9CA3AF'}1a;color:${RAG_COLOR[r.rag] || '#9CA3AF'};font-weight:500">
        ${optionsHTML(RAG, r.rag)}
      </select>
    </td>
    <td>
      <input class="raid-in" data-id="${r.id}" data-field="mitigation" value="${escapeAttr(r.mitigation || '')}" placeholder="What are we doing about it?">
    </td>
    <td>
      <input class="raid-in" type="date" data-id="${r.id}" data-field="target_date" value="${r.target_date || ''}">
    </td>
    <td>
      <select class="raid-in raid-chip" data-id="${r.id}" data-field="status"
              style="background:${STATUS_COLOR[r.status] || '#9CA3AF'}1a;color:${STATUS_COLOR[r.status] || '#9CA3AF'};font-weight:500">
        ${optionsHTML(STATUSES, r.status)}
      </select>
    </td>
    <td>
      <button class="raid-del" data-id="${r.id}" title="Delete"><i class="ti ti-trash" style="font-size:12px"></i></button>
    </td>
  </tr>`;
}

function isoDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function escapeHtml(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
