// planView.js — the "Plan" tab. Work breakdown structure with
// dependency-driven scheduling and clear phase/deliverable/milestone/task
// visual hierarchy. Renders from the resolved schedule.

import { fmt } from '../lib/dates.js';

const TYPE = {
  phase:      { color:'#534AB7' },
  deliverable:{ color:'#1D9E75' },
  milestone:  { color:'#BA7517' },
  task:       { color:'#6B7280' },
};
const STATUS_DOT = { todo:'#A0A7B4','in-progress':'#7F77DD', blocked:'#E24B4A', review:'#BA7517', done:'#1D9E75' };
const DEP_LABEL = { FS:'FS', SS:'SS', FF:'FF', SF:'SF' };

// Build WBS codes (1, 1.1, 1.1.1) from the parent hierarchy + sort_order.
function wbsCodes(tasks) {
  const codes = new Map();
  const phases = tasks.filter(t => t.type === 'phase').sort((a,b)=>a.sort_order-b.sort_order);
  phases.forEach((ph, i) => {
    const pcode = String(i+1);
    codes.set(ph.id, pcode);
    const children = tasks.filter(t => t.parent_id === ph.id).sort((a,b)=>a.sort_order-b.sort_order);
    let dIdx = 0, mIdx = 0;
    children.forEach(ch => {
      if (ch.type === 'milestone') { codes.set(ch.id, pcode + '.M' + (mIdx++ || '')); }
      else {
        dIdx++;
        const dcode = pcode + '.' + dIdx;
        codes.set(ch.id, dcode);
        const grand = tasks.filter(t => t.parent_id === ch.id).sort((a,b)=>a.sort_order-b.sort_order);
        grand.forEach((g, gi) => codes.set(g.id, dcode + '.' + (gi+1)));
      }
    });
  });
  return codes;
}

export function renderPlan({ mount, tasks, deps, resolved, critical, people, onSelect, selectedId }) {
  const codes = wbsCodes(tasks);
  const byId = new Map(tasks.map(t => [t.id, t]));
  const av = id => { const p = people.find(x=>x.id===id); return p
    ? `<span class="pv-av" style="background:${p.color}" title="${p.name}">${p.initials}</span>` : ''; };

  const depBadges = taskId => {
    const preds = deps.filter(d => d.successor_id === taskId);
    return preds.map(d => {
      const code = codes.get(d.predecessor_id) || '?';
      const crit = critical.has(taskId) && critical.has(d.predecessor_id);
      const lag = d.lag_days ? (d.lag_days>0?`+${d.lag_days}`:`${d.lag_days}`) : '';
      return `<span class="pv-dep ${crit?'crit':''}" title="${DEP_LABEL[d.type]} from ${byId.get(d.predecessor_id)?.name||''}">${DEP_LABEL[d.type]} ${code}${lag}</span>`;
    }).join('');
  };

  const sched = id => {
    const r = resolved.get(id);
    if (!r || !r.start) return '<span class="pv-dates">—</span>';
    return `<span class="pv-dates mono">${fmt(r.start)} – ${fmt(r.end)}</span>`;
  };
  const dur = id => { const r = resolved.get(id); return r?.duration!=null ? r.duration+'d' : '—'; };
  const eff = t => t.effort_min ? (t.effort_min>=480?(t.effort_min/480)+'d':t.effort_min>=60?(t.effort_min/60)+'h':t.effort_min+'m') : '—';

  const rows = [];
  const phases = tasks.filter(t => t.type==='phase').sort((a,b)=>a.sort_order-b.sort_order);

  for (const ph of phases) {
    const kids = tasks.filter(t => t.parent_id === ph.id && t.type!=='task');
    const allDesc = tasks.filter(t => t.parent_id===ph.id || byId.get(t.parent_id)?.parent_id===ph.id);
    const realTasks = allDesc.filter(t => t.type==='task');
    const pct = realTasks.length ? Math.round(realTasks.reduce((s,t)=>s+(t.progress||0),0)/realTasks.length) : (ph.progress||0);

    rows.push(`<div class="pv-row phase ${selectedId===ph.id?'sel':''}" data-id="${ph.id}">
      <div class="pv-name"><span class="pv-ph-ico"><i class="ti ti-chevron-down"></i></span>
        <span class="pv-ph-badge">Phase ${codes.get(ph.id)}</span>${ph.name}</div>
      <div class="pv-wbs">${codes.get(ph.id)}</div>
      <div class="pv-depcell">${depBadges(ph.id)}</div>
      <div class="pv-own"></div>
      <div class="pv-dur"></div>
      <div class="pv-schedcell">${sched(ph.id)}</div>
      <div class="pv-eff"><span class="pv-pct">${pct}%</span></div>
    </div>`);

    const children = kids.sort((a,b)=>a.sort_order-b.sort_order);
    for (const ch of children) {
      if (ch.type === 'milestone') {
        rows.push(`<div class="pv-row mile ${selectedId===ch.id?'sel':''}" data-id="${ch.id}">
          <div class="pv-name"><span class="pv-dia"></span><span class="pv-mile-name">${ch.name}</span><span class="pv-gate">Gate</span></div>
          <div class="pv-wbs">${codes.get(ch.id)}</div>
          <div class="pv-depcell">${depBadges(ch.id)}</div>
          <div class="pv-own">${av(ch.owner_id)}</div>
          <div class="pv-dur">0d</div>
          <div class="pv-schedcell">${sched(ch.id)}</div>
          <div class="pv-eff">—</div>
        </div>`);
        continue;
      }
      // deliverable
      rows.push(`<div class="pv-row deliv ${selectedId===ch.id?'sel':''}" data-id="${ch.id}">
        <div class="pv-name"><span class="pv-dl-chip"><i class="ti ti-package"></i></span><span class="pv-dl-name">${ch.name}</span></div>
        <div class="pv-wbs">${codes.get(ch.id)}</div>
        <div class="pv-depcell">${depBadges(ch.id)}</div>
        <div class="pv-own">${av(ch.owner_id)}</div>
        <div class="pv-dur">—</div>
        <div class="pv-schedcell">${sched(ch.id)}</div>
        <div class="pv-eff">${eff(ch)}</div>
      </div>`);

      const grand = tasks.filter(t => t.parent_id === ch.id).sort((a,b)=>a.sort_order-b.sort_order);
      grand.forEach(g => {
        const done = g.status === 'done';
        rows.push(`<div class="pv-row task ${selectedId===g.id?'sel':''}" data-id="${g.id}">
          <div class="pv-spine"></div><div class="pv-elbow"></div>
          <div class="pv-name">
            ${done?`<span class="pv-tick done"><i class="ti ti-check"></i></span>`:`<span class="pv-dot" style="background:${STATUS_DOT[g.status]}"></span>`}
            <span class="pv-task-name ${done?'done':''}">${g.name}</span>
          </div>
          <div class="pv-wbs">${codes.get(g.id)}</div>
          <div class="pv-depcell">${depBadges(g.id)}</div>
          <div class="pv-own">${av(g.owner_id)}</div>
          <div class="pv-dur">${dur(g.id)}</div>
          <div class="pv-schedcell">${sched(g.id)}</div>
          <div class="pv-eff">${eff(g)}</div>
        </div>`);
      });
    }
  }

  mount.innerHTML = `
    <div class="pv-head">
      <div class="pv-name">Task</div><div class="pv-wbs">WBS</div>
      <div class="pv-depcell">Dependencies</div><div class="pv-own">Owner</div>
      <div class="pv-dur">Dur</div><div class="pv-schedcell">Schedule</div><div class="pv-eff">Est</div>
    </div>
    <div class="pv-body">${rows.join('')}</div>`;

  mount.querySelectorAll('.pv-row').forEach(r =>
    r.addEventListener('click', () => onSelect(r.dataset.id)));
}
