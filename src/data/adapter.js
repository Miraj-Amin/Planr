// adapter.js — LocalAdapter (sync) and SupabaseAdapter (async load, optimistic writes).

export class LocalAdapter {
  constructor(seed) {
    this.key = 'planr.db.v2';
    let saved = null;
    try { saved = localStorage.getItem(this.key); } catch(e) {}
    this.db = saved ? JSON.parse(saved) : structuredClone(seed);
  }
  _persist() { try { localStorage.setItem(this.key, JSON.stringify(this.db)); } catch(e) {} }
  all(t)        { return this.db[t] || []; }
  get(t, id)    { return (this.db[t] || []).find(r => r.id === id) || null; }
  where(t, fn)  { return (this.db[t] || []).filter(fn); }
  insert(t, rec){ rec.id = rec.id || (t.slice(0,2)+'_'+Math.random().toString(36).slice(2,9));
                  (this.db[t]=this.db[t]||[]).push(rec); this._persist(); return rec; }
  insertAwait(t, rec) { return Promise.resolve(this.insert(t, rec)); }
  updateAwait(t, id, patch) { return Promise.resolve(this.update(t, id, patch)); }
  batchInsert(t, recs) { (recs || []).forEach(r => this.insert(t, r)); return Promise.resolve(recs || []); }
  removeAwait(t, id) { this.remove(t, id); return Promise.resolve(); }
  update(t, id, patch){ const r=this.get(t,id); if(r){Object.assign(r,patch);this._persist();} return r; }
  remove(t, id) { this.db[t]=(this.db[t]||[]).filter(r=>r.id!==id); this._persist(); }
}

export class SupabaseAdapter {
  constructor(client) { this.sb = client; this._cache = {}; }

  // Lightweight load for the projects overview — fetches all projects + slim task list.
  // Also pulls templates and risks so the home dashboard and Templates tab work.
  async loadOverview() {
    const [projects, tasks, people, deliverables, risks, templates, templateTasks] = await Promise.all([
      this.sb.from('projects').select('*'),
      this.sb.from('tasks').select('*'),
      this.sb.from('people').select('*'),
      this.sb.from('deliverables').select('id,project_id,name,status,due_date,sort_order'),
      this.sb.from('risks').select('*'),
      this.sb.from('templates').select('*'),
      this.sb.from('template_tasks').select('*'),
    ]);
    this._cache.projects       = projects.data       || [];
    this._cache.allTasks       = tasks.data          || [];   // slim, overview only
    this._cache.tasks          = tasks.data          || [];   // also fill tasks so global views work
    this._cache.people         = people.data         || [];
    this._cache.deliverables   = deliverables.data   || [];
    this._cache.risks          = risks.data          || [];
    this._cache.templates      = templates.data      || [];
    this._cache.template_tasks = templateTasks.data  || [];
    // preserve any project-specific data already loaded
    if (!this._cache.sprints)      this._cache.sprints = [];
    if (!this._cache.dependencies) this._cache.dependencies = [];
    if (!this._cache.meetings)     this._cache.meetings = [];
    if (!this._cache.meeting_items)      this._cache.meeting_items = [];
    if (!this._cache.meeting_item_links) this._cache.meeting_item_links = [];

    const errs = [projects, tasks, people, deliverables, risks, templates, templateTasks].map(r=>r.error).filter(Boolean);
    if (errs.length) console.error('Overview load errors:', errs);
  }

  // Full load for a specific project
  async load(projectId) {
    const [people, projects, deliverables, sprints, tasks, deps, meetings, projectContacts, risks, templates, templateTasks] = await Promise.all([
      this.sb.from('people').select('*'),
      this.sb.from('projects').select('*'),
      this.sb.from('deliverables').select('*').eq('project_id', projectId),
      this.sb.from('sprints').select('*').eq('project_id', projectId),
      this.sb.from('tasks').select('*').eq('project_id', projectId),
      this.sb.from('dependencies').select('*').eq('project_id', projectId),
      this.sb.from('meetings').select('*').eq('project_id', projectId),
      this.sb.from('project_contacts').select('*').eq('project_id', projectId),
      this.sb.from('risks').select('*').eq('project_id', projectId),
      this.sb.from('templates').select('*'),
      this.sb.from('template_tasks').select('*'),
    ]);

    const taskIds    = (tasks.data || []).map(t => t.id);
    const meetingIds = (meetings.data || []).map(m => m.id);

    const [mitems, milinks, tcomments] = await Promise.all([
      taskIds.length
        ? this.sb.from('meeting_items').select('*').in('task_id', taskIds)
        : Promise.resolve({ data: [] }),
      meetingIds.length
        ? this.sb.from('meeting_item_links').select('*').in('meeting_id', meetingIds)
        : Promise.resolve({ data: [] }),
      taskIds.length
        ? this.sb.from('task_comments').select('*').in('task_id', taskIds)
        : Promise.resolve({ data: [] }),
    ]);

    const commentIds = (tcomments.data || []).map(c => c.id);
    const thist = commentIds.length
      ? await this.sb.from('task_comment_history').select('*').in('comment_id', commentIds)
      : { data: [] };

    this._cache = {
      projects:           projects.data      || [],
      people:             people.data        || [],
      deliverables:       deliverables.data  || [],
      sprints:            sprints.data       || [],
      tasks:              tasks.data         || [],
      allTasks:           tasks.data         || [],
      dependencies:       deps.data          || [],
      meetings:           meetings.data      || [],
      meeting_items:      mitems.data        || [],
      meeting_item_links: milinks.data       || [],
      project_members:    [],
      project_contacts:   projectContacts.data || [],
      task_comments:      tcomments.data     || [],
      task_comment_history: thist.data       || [],
      risks:              risks.data         || [],
      templates:          templates.data     || [],
      template_tasks:     templateTasks.data || [],
    };

    const errs = [people,projects,deliverables,sprints,tasks,deps,meetings,mitems,milinks,tcomments,thist,risks,templates,templateTasks]
      .map(r=>r.error).filter(Boolean);
    if (errs.length) console.error('Project load errors:', errs);
  }

  all(t)       { return this._cache[t] || []; }
  get(t, id)   { return (this._cache[t] || []).find(r => r.id === id) || null; }
  where(t, fn) { return (this._cache[t] || []).filter(fn); }

  insert(t, rec) {
    rec.id = rec.id || crypto.randomUUID();
    (this._cache[t] = this._cache[t] || []).push(rec);
    this.sb.from(t).insert(rec).then(({ error }) => {
      if (error) {
        console.error(`❌ Insert [${t}] failed:`, error.message, rec);
        // Show user-facing error since the row will vanish on next refresh
        if (typeof window !== 'undefined') {
          const msg = `Couldn't save to ${t}: ${error.message}`;
          // Debounce so multiple failures don't spam
          if (!this._lastErr || Date.now() - this._lastErr > 2000) {
            this._lastErr = Date.now();
            alert(msg);
          }
        }
        this._cache[t] = (this._cache[t] || []).filter(r => r.id !== rec.id);
      }
    });
    return rec;
  }

  // Same as insert but returns a Promise that resolves once the write has landed.
  // Use this whenever a subsequent insert depends on this row's id (FK relationship).
  async insertAwait(t, rec) {
    rec.id = rec.id || crypto.randomUUID();
    (this._cache[t] = this._cache[t] || []).push(rec);
    const { error } = await this.sb.from(t).insert(rec);
    if (error) {
      this._cache[t] = (this._cache[t] || []).filter(r => r.id !== rec.id);
      throw new Error(`Insert [${t}] failed: ${error.message}`);
    }
    return rec;
  }

  // Awaitable update, used during template migrations where subsequent writes
  // rely on the patched row being current in the DB.
  async updateAwait(t, id, patch) {
    const r = this.get(t, id);
    if (r) Object.assign(r, patch);
    const { error } = await this.sb.from(t).update(patch).eq('id', id);
    if (error) throw new Error(`Update [${t}] failed: ${error.message}`);
    return r;
  }

  // Batch insert — a single round-trip that either lands every row or none.
  // Postgres treats a single INSERT as one transaction, so if any row violates a
  // constraint the whole batch is rolled back on the server side. That gives us
  // real atomicity for imports (versus firing many Promise.all inserts, where a
  // late failure still leaves the earlier successful rows behind).
  async batchInsert(t, recs) {
    if (!recs || recs.length === 0) return [];
    recs.forEach(r => { r.id = r.id || crypto.randomUUID(); });
    (this._cache[t] = this._cache[t] || []).push(...recs);
    const { error } = await this.sb.from(t).insert(recs);
    if (error) {
      const ids = new Set(recs.map(r => r.id));
      this._cache[t] = this._cache[t].filter(r => !ids.has(r.id));
      throw new Error(`Batch insert [${t}] (${recs.length} rows) failed: ${error.message}`);
    }
    return recs;
  }

  // Awaitable delete used for rollback during import failure.
  async removeAwait(t, id) {
    this._cache[t] = (this._cache[t] || []).filter(r => r.id !== id);
    const { error } = await this.sb.from(t).delete().eq('id', id);
    if (error) throw new Error(`Delete [${t}] failed: ${error.message}`);
  }

  update(t, id, patch) {
    const r = this.get(t, id);
    if (r) Object.assign(r, patch);
    this.sb.from(t).update(patch).eq('id', id).then(({ error }) => {
      if (error) console.error(`❌ Update [${t}] failed:`, error.message);
    });
    return r;
  }

  remove(t, id) {
    this._cache[t] = (this._cache[t] || []).filter(r => r.id !== id);
    this.sb.from(t).delete().eq('id', id).then(({ error }) => {
      if (error) console.error(`❌ Delete [${t}] failed:`, error.message);
    });
  }
}
