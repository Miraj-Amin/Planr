// rollupService.js — deliverable + phase rollups, horizon, effort burn.
// Mirrors the SQL views in 0005 so the LocalAdapter behaves identically
// to Supabase. When on Supabase these become db.raw('horizon_tasks', {...}).

import { parse, stripTime } from '../lib/dates.js';

const TODAY = stripTime(new Date(2026, 8, 13)); // demo-fixed "today"

export class RollupService {
  constructor(db) { this.db = db; }

  ownerOf(t)      { return t.owner_id ? this.db.get('people', t.owner_id) : null; }
  isClientOwned(t){ const o = this.ownerOf(t); return !!(o && o.is_client); }
  isOverdue(t)    { const d = parse(t.end_date); return !!d && d < TODAY && t.status !== 'done'; }
  isSoon(t)       { const d = parse(t.end_date); if (!d || t.status==='done') return false;
                    const k = Math.round((d-TODAY)/86400000); return k>=0 && k<=3; }
  clientNoDate(t) { return this.isClientOwned(t) && !t.end_date && t.status !== 'done'; }
  inHorizon(t,n=7){ const d = parse(t.end_date); if(!d) return false;
                    const k = Math.round((d-TODAY)/86400000); return k>=0 && k<=n; }

  deliverableRollup(deliverableId) {
    const kids = this.db.where('tasks',
      t => t.deliverable_id === deliverableId && t.type !== 'agenda' && t.type !== 'followup');
    const starts = kids.map(k => k.start_date).filter(Boolean).sort();
    const ends   = kids.map(k => k.end_date).filter(Boolean).sort();
    const done   = kids.filter(k => k.status === 'done').length;
    return {
      start_date: starts[0] || null,
      end_date:   ends[ends.length - 1] || null,
      effort_min: kids.reduce((s,k)=>s+(k.effort_min||0),0),
      logged_min: kids.reduce((s,k)=>s+(k.logged_min||0),0),
      progress:   kids.length ? Math.round(kids.reduce((s,k)=>s+(k.progress||0),0)/kids.length) : 0,
      done_count: done, task_count: kids.length,
      status: kids.length && done === kids.length ? 'done' : kids.some(k=>k.status==='in-progress') ? 'in-progress' : 'todo',
    };
  }

  projectEffort(projectId) {
    const ts = this.db.where('tasks', t => t.project_id === projectId && (t.type==='task'||t.type==='deliverable'));
    const est = ts.reduce((s,t)=>s+(t.effort_min||0),0);
    const log = ts.reduce((s,t)=>s+(t.logged_min||0),0);
    return { estimated_min: est, logged_min: log, variance_min: log - est };
  }
}
