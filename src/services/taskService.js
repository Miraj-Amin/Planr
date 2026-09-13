// taskService.js — task + dependency operations.
// Views never mutate data directly; they call these.

import { schedule, criticalPath } from '../lib/scheduler.js';
import { endFromDuration, durationFromDates } from '../lib/dates.js';

export class TaskService {
  constructor(db) { this.db = db; }

  forProject(pid)  { return this.db.where('tasks', t => t.project_id === pid); }
  depsForProject(pid) { return this.db.where('dependencies', d => d.project_id === pid); }

  // Recompute all task dates for a project and persist the ones that moved.
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
    return this.reschedule(projectId, projectStartISO);
  }

  setDates(taskId, projectId, projectStartISO, startISO, endISO) {
    this.db.update('tasks', taskId, {
      start_date: startISO,
      end_date: endISO,
      duration_days: durationFromDates(startISO, endISO),
      is_scheduled_manually: true,   // pinning a date opts out of cascade
    });
    return this.reschedule(projectId, projectStartISO);
  }

  addDependency(projectId, predecessorId, successorId, type = 'FS', lag = 0, projectStartISO) {
    // guard against self and duplicate; cycle guard lives in SQL for the real DB
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
    // can we already reach predId starting from succId?
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
