// scheduler.js — dependency resolution and date cascade.
//
// Given tasks + dependencies, this computes each task's start/end by
// walking the graph in topological order and applying the four
// precedence relationships with lag. It also derives the critical path.
//
// This is pure: it takes data in, returns computed dates out. It never
// touches the DB — the service layer decides what to persist.

import { parse, iso, addWorkingDays, endFromDuration, durationFromDates } from './dates.js';

// Resolve one successor's constraint date from one dependency.
// Returns the earliest ISO date the successor edge allows, or null.
function constraintDate(dep, predResolved) {
  const ps = predResolved.start, pe = predResolved.end;
  if (!ps || !pe) return null;
  const lag = dep.lag_days || 0;
  switch (dep.type) {
    case 'FS': return iso(addWorkingDays(parse(pe), 1 + lag));   // start after finish
    case 'SS': return iso(addWorkingDays(parse(ps), lag));       // start with start
    case 'FF': return iso(addWorkingDays(parse(pe), lag));       // finish with finish -> maps to end
    case 'SF': return iso(addWorkingDays(parse(ps), lag));       // finish with start -> maps to end
    default:   return null;
  }
}

// Kahn topological sort over the dependency edges.
function topoOrder(tasks, deps) {
  const indeg = new Map(tasks.map(t => [t.id, 0]));
  const adj = new Map(tasks.map(t => [t.id, []]));
  for (const d of deps) {
    if (!adj.has(d.predecessor_id) || !indeg.has(d.successor_id)) continue;
    adj.get(d.predecessor_id).push(d);
    indeg.set(d.successor_id, indeg.get(d.successor_id) + 1);
  }
  const queue = tasks.filter(t => indeg.get(t.id) === 0).map(t => t.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const d of adj.get(id) || []) {
      indeg.set(d.successor_id, indeg.get(d.successor_id) - 1);
      if (indeg.get(d.successor_id) === 0) queue.push(d.successor_id);
    }
  }
  // any leftover means a cycle; append them so nothing is dropped
  if (order.length < tasks.length) {
    for (const t of tasks) if (!order.includes(t.id)) order.push(t.id);
  }
  return order;
}

// Compute resolved {start,end,duration} for every task.
// - Manual-pinned tasks keep their start; others are pushed by predecessors.
// - Tasks with no predecessors keep their own start (or project start).
export function schedule(tasks, deps, projectStartISO) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const predsOf = new Map(tasks.map(t => [t.id, []]));
  for (const d of deps) if (predsOf.has(d.successor_id)) predsOf.get(d.successor_id).push(d);

  const resolved = new Map();
  const order = topoOrder(tasks, deps);

  for (const id of order) {
    const t = byId.get(id);
    if (!t) continue;
    const duration = t.duration_days || durationFromDates(t.start_date, t.end_date) || 1;

    let start = t.start_date || projectStartISO;

    if (!t.is_scheduled_manually) {
      let earliest = null;
      let endConstraint = null;
      for (const dep of predsOf.get(id)) {
        const pr = resolved.get(dep.predecessor_id);
        if (!pr) continue;
        const c = constraintDate(dep, pr);
        if (!c) continue;
        if (dep.type === 'FF' || dep.type === 'SF') {
          if (!endConstraint || c > endConstraint) endConstraint = c;
        } else {
          if (!earliest || c > earliest) earliest = c;
        }
      }
      if (earliest) start = earliest;
      if (endConstraint && !earliest) {
        // derive start backward from the end constraint
        start = iso(addWorkingDays(parse(endConstraint), -(duration - 1)));
      }
    }

    const end = endFromDuration(start, duration);
    resolved.set(id, { id, start, end, duration });
  }

  return resolved;
}

// Critical path: longest chain by end date. Marks tasks whose slip
// would slip the project. Returns a Set of task ids.
export function criticalPath(tasks, deps, resolved) {
  const succOf = new Map(tasks.map(t => [t.id, []]));
  for (const d of deps) if (succOf.has(d.predecessor_id)) succOf.get(d.predecessor_id).push(d.successor_id);

  // project end = latest end
  let endId = null, endDate = null;
  for (const [id, r] of resolved) {
    if (!endDate || (r.end && r.end > endDate)) { endDate = r.end; endId = id; }
  }
  if (!endId) return new Set();

  // walk backward from the last-finishing task along zero-slack edges
  const predOf = new Map(tasks.map(t => [t.id, []]));
  for (const d of deps) if (predOf.has(d.successor_id)) predOf.get(d.successor_id).push(d.predecessor_id);

  const critical = new Set([endId]);
  const stack = [endId];
  while (stack.length) {
    const id = stack.pop();
    const cur = resolved.get(id);
    if (!cur) continue;
    for (const pid of predOf.get(id) || []) {
      const p = resolved.get(pid);
      if (!p) continue;
      // predecessor is on the path if its finish drives this start
      if (p.end && cur.start && parse(cur.start) > parse(p.end) === false ||
          (p.end && cur.start && p.end < cur.start)) {
        if (!critical.has(pid)) { critical.add(pid); stack.push(pid); }
      }
    }
  }
  return critical;
}
