// ganttView.js — Timeline visualisation for a project's tasks.
// Rows are sorted by start date; bars span start_date → end_date.
// Milestones show as diamonds. Phases render as banded lanes.
// Today's date shows as a vertical purple line.

const DAY_MS   = 86400000;
const MIN_DAYW = 8;    // narrow zoom
const MAX_DAYW = 40;   // wide zoom
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
const STATUS_STRIPE = {
  'blocked':     '#E24B4A',
  'in-progress': '#7F77DD',
  'review':      '#BA7517',
  'done':        '#1D9E75',
  'todo':        '#A0A7B4',
};

let G_ZOOM = 18;   // px per day

export function renderGantt({ mount, tasks, people, projectId, onSelect }) {
  const projTasks = tasks.filter(t =>
    t.project_id === projectId &&
    t.type !== 'agenda' && t.type !== 'action' && t.type !== 'followup' && t.type !== 'meeting'
  );

  // Only tasks that have a real start & end can be plotted; parents get computed
  // from children's spans so a phase renders as one lane.
  const dated = projTasks.filter(t => t.start_date && t.end_date);
  if (!dated.length) {
    mount.innerHTML = `<div class="gantt-empty">
      <i class="ti ti-chart-gantt" style="font-size:32px;color:#C4C9D4;margin-bottom:10px"></i>
      <div style="font-size:14px;color:#374151;margin-bottom:4px">No dated tasks yet</div>
      <div style="font-size:12px;color:#9CA3AF">Add start and due dates in the Plan to see the Gantt.</div>
    </div>`;
    return;
  }

  // Compute overall range
  const min = new Date(Math.min(...dated.map(t => new Date(t.start_date).getTime())));
  const max = new Date(Math.max(...dated.map(t => new Date(t.end_date).getTime())));
  // Round to nearest week edge (Monday) for a clean axis
  const rangeStart = mondayBefore(min);
  const rangeEnd   = mondayAfter(max);
  const totalDays  = Math.round((rangeEnd - rangeStart) / DAY_MS) + 1;

  const sorted = [...dated].sort((a, b) => {
    const ap = a.phase_order || phaseOrder(a.phase);
    const bp = b.phase_order || phaseOrder(b.phase);
    if (ap !== bp) return ap - bp;
    return (new Date(a.start_date)) - (new Date(b.start_date));
  });

  const today = new Date(); today.setHours(0,0,0,0);
  const todayOffset = Math.round((today - rangeStart) / DAY_MS);

  // Header — months + days
  const months = buildMonthHeader(rangeStart, rangeEnd);
  const rowH = 30;
  const chartHeight = sorted.length * rowH;
  const chartWidth  = totalDays * G_ZOOM;

  mount.innerHTML = `
    <div class="gantt-wrap">
      <div class="gantt-toolbar">
        <span style="font-size:11px;color:#6B7280">Zoom</span>
        <button class="gantt-zoom" data-dir="-" title="Zoom out"><i class="ti ti-minus" style="font-size:11px"></i></button>
        <button class="gantt-zoom" data-dir="+" title="Zoom in"><i class="ti ti-plus" style="font-size:11px"></i></button>
        <span style="font-size:11px;color:#9CA3AF;margin-left:auto">${sorted.length} tasks · ${totalDays} days</span>
      </div>
      <div class="gantt-scroll" id="ganttScroll">
        <div class="gantt-body" style="width:${300 + chartWidth}px">
          <div class="gantt-left" style="width:300px">
            <div class="gantt-left-h">Task</div>
            ${sorted.map(t => {
              const owner = people.find(p => p.id === t.owner_id);
              const phaseCol = PHASE_COLORS[t.phase] || '#9CA3AF';
              return `<div class="gantt-left-row" data-task="${t.id}">
                <span class="gantt-phase-tag" style="background:${phaseCol}"></span>
                <span class="gantt-name">${escapeHtml(t.name || 'Untitled')}</span>
                ${owner ? `<span class="av" style="background:${owner.color};width:18px;height:18px;font-size:8px" title="${escapeHtml(owner.name)}">${owner.initials}</span>` : ''}
              </div>`;
            }).join('')}
          </div>
          <div class="gantt-right" style="width:${chartWidth}px">
            <div class="gantt-header">
              <div class="gantt-months" style="width:${chartWidth}px">
                ${months.map(m => `<div class="gantt-month" style="width:${m.days * G_ZOOM}px">${m.label}</div>`).join('')}
              </div>
              <div class="gantt-days" style="width:${chartWidth}px">
                ${buildDayHeader(rangeStart, totalDays)}
              </div>
            </div>
            <div class="gantt-chart" style="height:${chartHeight}px;width:${chartWidth}px">
              <!-- Week grid lines -->
              ${weekGridLines(rangeStart, totalDays)}
              <!-- Today marker -->
              ${todayOffset >= 0 && todayOffset <= totalDays ? `
                <div class="gantt-today" style="left:${todayOffset * G_ZOOM}px;height:${chartHeight}px" title="Today"></div>
              ` : ''}
              <!-- Bars -->
              ${sorted.map((t, i) => barHTML(t, rangeStart, i * rowH)).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Zoom
  mount.querySelectorAll('.gantt-zoom').forEach(b => {
    b.addEventListener('click', () => {
      const step = 4;
      G_ZOOM = b.dataset.dir === '+' ? Math.min(MAX_DAYW, G_ZOOM + step) : Math.max(MIN_DAYW, G_ZOOM - step);
      renderGantt({ mount, tasks, people, projectId, onSelect });
    });
  });

  // Click a bar or a row to drill in
  mount.querySelectorAll('.gantt-left-row, .gantt-bar, .gantt-milestone').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.task;
      if (id) onSelect?.(id);
    });
  });
}

function barHTML(t, rangeStart, top) {
  const start = new Date(t.start_date);
  const end   = new Date(t.end_date);
  const startOff = Math.round((start - rangeStart) / DAY_MS);
  const days     = Math.max(1, Math.round((end - start) / DAY_MS) + 1);
  const left = startOff * G_ZOOM;
  const width = days * G_ZOOM;
  const stripe = STATUS_STRIPE[t.status] || '#A0A7B4';
  const phaseCol = PHASE_COLORS[t.phase] || '#9CA3AF';
  const progress = Math.max(0, Math.min(100, t.progress || 0));

  if (t.is_milestone || t.type === 'milestone') {
    return `<div class="gantt-milestone" data-task="${t.id}"
              style="left:${left + width/2 - 8}px;top:${top + 6}px"
              title="${escapeAttr(t.name)}">
      <i class="ti ti-diamond-filled" style="font-size:16px;color:${phaseCol}"></i>
    </div>`;
  }
  return `<div class="gantt-bar" data-task="${t.id}"
            style="left:${left}px;top:${top + 5}px;width:${width}px;background:${phaseCol}22;border-left:3px solid ${stripe}"
            title="${escapeAttr(t.name)}\n${t.start_date} → ${t.end_date}">
    <div class="gantt-bar-fill" style="width:${progress}%;background:${phaseCol}55"></div>
    <div class="gantt-bar-label">${escapeHtml(t.name || '')}</div>
  </div>`;
}

function buildMonthHeader(start, end) {
  const months = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    const monthStart = new Date(Math.max(cur.getTime(), start.getTime()));
    const nextMonth  = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const monthEnd   = new Date(Math.min(nextMonth.getTime() - DAY_MS, end.getTime()));
    const days = Math.round((monthEnd - monthStart) / DAY_MS) + 1;
    months.push({
      label: cur.toLocaleString('en', { month: 'short', year: 'numeric' }),
      days,
    });
    cur = nextMonth;
  }
  return months;
}
function buildDayHeader(start, totalDays) {
  let html = '';
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isMon = dow === 1;
    html += `<div class="gantt-day" style="width:${G_ZOOM}px;background:${isWeekend ? 'rgba(0,0,0,.03)' : 'transparent'};font-weight:${isMon ? '600' : '400'};color:${isWeekend ? '#C4C9D4' : '#6B7280'}">${d.getDate()}</div>`;
  }
  return html;
}
function weekGridLines(start, totalDays) {
  let html = '';
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    if (d.getDay() === 1) {
      html += `<div class="gantt-week-line" style="left:${i * G_ZOOM}px"></div>`;
    }
  }
  return html;
}
function mondayBefore(d) {
  const x = new Date(d); x.setHours(0,0,0,0);
  const dow = x.getDay();
  const back = dow === 0 ? 6 : dow - 1;
  x.setDate(x.getDate() - back);
  return x;
}
function mondayAfter(d) {
  const x = new Date(d); x.setHours(0,0,0,0);
  const dow = x.getDay();
  const fwd = dow === 0 ? 1 : (8 - dow) % 7 || 7;
  x.setDate(x.getDate() + fwd);
  return x;
}
function phaseOrder(phase) {
  const order = ['Initiation & Handover', 'Design & Discovery', 'Development', 'UAT & Testing',
                 'Deployment Readiness', 'Go Live', 'Hypercare', 'Project Closure'];
  const i = order.indexOf(phase);
  return i === -1 ? 999 : i;
}
function escapeHtml(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
