// adapter.js — data access contract.
// LocalAdapter: sync, persists to localStorage (dev/fallback).
// SupabaseAdapter: async load() hydrates a local cache; all subsequent
// reads are sync from cache; writes update cache immediately (optimistic)
// and persist to Supabase in the background.

export class LocalAdapter {
  constructor(seed) {
    this.key = 'planr.db.v2';
    let saved = null;
    try { saved = localStorage.getItem(this.key); } catch (e) {}
    this.db = saved ? JSON.parse(saved) : structuredClone(seed);
  }
  _persist() { try { localStorage.setItem(this.key, JSON.stringify(this.db)); } catch (e) {} }
  all(t) { return this.db[t] || []; }
  get(t, id) { return (this.db[t] || []).find(r => r.id === id) || null; }
  where(t, fn) { return (this.db[t] || []).filter(fn); }
  insert(t, rec) {
    rec.id = rec.id || (t.slice(0,2) + '_' + Math.random().toString(36).slice(2,9));
    (this.db[t] = this.db[t] || []).push(rec); this._persist(); return rec;
  }
  update(t, id, patch) {
    const r = this.get(t, id); if (r) { Object.assign(r, patch); this._persist(); } return r;
  }
  remove(t, id) { this.db[t] = (this.db[t] || []).filter(r => r.id !== id); this._persist(); }
}

export class SupabaseAdapter {
  constructor(client) {
    this.sb = client;
    this._cache = {};
  }

  // Call before rendering. Fetches all data for a project into memory.
  // Subsequent reads are synchronous from cache until the next load().
  async load(projectId) {
    const [people, projects, deliverables, sprints, tasks, deps, meetings] = await Promise.all([
      this.sb.from('people').select('*'),
      this.sb.from('projects').select('*'),
      this.sb.from('deliverables').select('*').eq('project_id', projectId),
      this.sb.from('sprints').select('*').eq('project_id', projectId),
      this.sb.from('tasks').select('*').eq('project_id', projectId),
      this.sb.from('dependencies').select('*').eq('project_id', projectId),
      this.sb.from('meetings').select('*').eq('project_id', projectId),
    ]);

    const taskIds = (tasks.data || []).map(t => t.id);
    const meetingIds = (meetings.data || []).map(m => m.id);

    const [mitems, milinks] = await Promise.all([
      taskIds.length
        ? this.sb.from('meeting_items').select('*').in('task_id', taskIds)
        : Promise.resolve({ data: [] }),
      meetingIds.length
        ? this.sb.from('meeting_item_links').select('*').in('meeting_id', meetingIds)
        : Promise.resolve({ data: [] }),
    ]);

    this._cache = {
      people:             people.data || [],
      projects:           projects.data || [],
      deliverables:       deliverables.data || [],
      sprints:            sprints.data || [],
      tasks:              tasks.data || [],
      dependencies:       deps.data || [],
      meetings:           meetings.data || [],
      meeting_items:      mitems.data || [],
      meeting_item_links: milinks.data || [],
    };

    // surface any load errors
    const errs = [people, projects, deliverables, sprints, tasks, deps, meetings, mitems, milinks]
      .map(r => r.error).filter(Boolean);
    if (errs.length) console.error('Supabase load errors:', errs);
  }

  // Synchronous reads from cache
  all(t)        { return this._cache[t] || []; }
  get(t, id)    { return (this._cache[t] || []).find(r => r.id === id) || null; }
  where(t, fn)  { return (this._cache[t] || []).filter(fn); }

  // Optimistic writes: cache updates immediately, Supabase in background
  insert(t, rec) {
    rec.id = rec.id || crypto.randomUUID();
    (this._cache[t] = this._cache[t] || []).push(rec);
    this.sb.from(t).insert(rec)
      .then(({ error }) => { if (error) console.error(`Insert ${t} failed:`, error.message); });
    return rec;
  }

  update(t, id, patch) {
    const r = this.get(t, id);
    if (r) Object.assign(r, patch);
    this.sb.from(t).update(patch).eq('id', id)
      .then(({ error }) => { if (error) console.error(`Update ${t} failed:`, error.message); });
    return r;
  }

  remove(t, id) {
    this._cache[t] = (this._cache[t] || []).filter(r => r.id !== id);
    this.sb.from(t).delete().eq('id', id)
      .then(({ error }) => { if (error) console.error(`Delete ${t} failed:`, error.message); });
  }
}
