// taskService.js — task + dependency operations + date rollup.

import { schedule, criticalPath } from '../lib/scheduler.js';
import { endFromDuration, durationFromDates } from '../lib/dates.js';

export class TaskService {
  constructor(db) { this.db = db; }

  forProject(pid)     { return this.db.where('tasks', t => t.project_id === pid); }
  depsForProject(pid) { return this.db.where('dependencies', d => d.project_id === pid); }

  // Recompute all task dates via dependency cascade.
  reschedule(projectId, projectStartISO) {
    const tasks = this.forProject(projectId).filter(t => t.type !== 'agenda' && t.type !== 'followup');
    const deps  = this.depsForProject(projectId);
    const resolved = schedule(tasks, deps, projectStartISO);
    const critical = criticalPath(tasks, deps, resolved);
    for (const [id, r] of resolved) {
      const t = this.db.get('tasks', id);
      if (t && (t.start_date !== r.start || t.end_date !== r.end)) {
        this.db.update('tasks', id, { start_date: r.start, end_date: r.end, duration_days: r.duration });
      }
    }
    return { resolved, critical };
  }

  setDuration(taskId, projectId, projectStartISO, durationDays) {
    const t = this.db.get('tasks', taskId);
    this.db.update('tasks', taskId, {
      duration_days: durationDays,
      end_date: endFromDuration(t.start_date, durationDays),
    });
    this.rollupParentDates(t.parent_id, projectId);
    return this.reschedule(projectId, projectStartISO);
  }

  setDates(taskId, projectId, projectStartISO, startISO, endISO) {
    this.db.update('tasks', taskId, {
      start_date: startISO, end_date: endISO,
      duration_days: durationFromDates(startISO, endISO),
      is_scheduled_manually: true,
    });
    const t = this.db.get('tasks', taskId);
    this.rollupParentDates(t.parent_id, projectId);
    return this.reschedule(projectId, projectStartISO);
  }

  // Roll start/end dates up the parent chain.
  // Parent start = earliest child start. Parent end = latest child end.
  rollupParentDates(parentId, projectId) {
    if (!parentId) return;
    const parent = this.db.get('tasks', parentId);
    if (!parent) return;
    const children = this.db.where('tasks',
      t => t.parent_id === parentId && (t.start_date || t.end_date));
    if (!children.length) return;

    const starts = children.map(c => c.start_date).filter(Boolean).sort();
    const ends   = children.map(c => c.end_date).filter(Boolean).sort();

    this.db.update('tasks', parentId, {
      start_date: starts[0]             || parent.start_date,
      end_date:   ends[ends.length - 1] || parent.end_date,
    });

    // Walk up the tree
    this.rollupParentDates(parent.parent_id, projectId);
  }

  addDependency(projectId, predecessorId, successorId, type = 'FS', lag = 0, projectStartISO) {
    if (predecessorId === successorId) throw new Error('A task cannot depend on itself');
    const exists = this.db.where('dependencies',
      d => d.predecessor_id === predecessorId && d.successor_id === successorId)[0];
    if (exists) return this.reschedule(projectId, projectStartISO);
    if (this._wouldCycle(projectId, predecessorId, successorId))
      throw new Error('That dependency would create a loop');
    this.db.insert('dependencies', {
      project_id: projectId, predecessor_id: predecessorId,
      successor_id: successorId, type, lag_days: lag,
    });
    return this.reschedule(projectId, projectStartISO);
  }

  removeDependency(depId, projectId, projectStartISO) {
    this.db.remove('dependencies', depId);
    return this.reschedule(projectId, projectStartISO);
  }

  _wouldCycle(projectId, predId, succId) {
    const deps = this.depsForProject(projectId);
    const adj = new Map();
    for (const d of deps) {
      if (!adj.has(d.predecessor_id)) adj.set(d.predecessor_id, []);
      adj.get(d.predecessor_id).push(d.successor_id);
    }
    const seen = new Set(); const stack = [succId];
    while (stack.length) {
      const n = stack.pop();
      if (n === predId) return true;
      if (seen.has(n)) continue; seen.add(n);
      for (const m of adj.get(n) || []) stack.push(m);
    }
    return false;
  }

  predecessorsOf(taskId) {
    return this.db.where('dependencies', d => d.successor_id === taskId)
      .map(d => ({ dep: d, task: this.db.get('tasks', d.predecessor_id) }))
      .filter(x => x.task);
  }
  successorsOf(taskId) {
    return this.db.where('dependencies', d => d.predecessor_id === taskId)
      .map(d => ({ dep: d, task: this.db.get('tasks', d.successor_id) }))
      .filter(x => x.task);
  }
}
