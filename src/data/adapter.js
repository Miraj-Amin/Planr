// adapter.js — data access contract.
//
// Every service talks to ONE of these adapters. Swapping the backend
// is a single import change in services/db.js. The shape mirrors the
// MGS pattern: a thin data layer under the services, never touched by
// views directly.

// The contract every adapter implements:
//   all(table)                     -> array
//   get(table, id)                 -> record | null
//   where(table, predicate)        -> array
//   insert(table, record)          -> record (with id)
//   update(table, id, patch)       -> record
//   remove(table, id)              -> void
//   raw(name, params)              -> array   (views / rpc: horizon, rollups)

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
    rec.id = rec.id || (t.slice(0, 2) + '_' + Math.random().toString(36).slice(2, 9));
    (this.db[t] = this.db[t] || []).push(rec);
    this._persist();
    return rec;
  }
  update(t, id, patch) {
    const r = this.get(t, id);
    if (r) { Object.assign(r, patch); this._persist(); }
    return r;
  }
  remove(t, id) { this.db[t] = (this.db[t] || []).filter(r => r.id !== id); this._persist(); }
  reset(seed) { try { localStorage.removeItem(this.key); } catch (e) {} this.db = structuredClone(seed); }
  // raw views are computed client-side in the LocalAdapter (see services)
  raw() { return []; }
}

// SupabaseAdapter — same surface, async. Views/rpc go through raw().
export class SupabaseAdapter {
  constructor(client) { this.sb = client; }
  async all(t) { const { data } = await this.sb.from(t).select('*'); return data || []; }
  async get(t, id) { const { data } = await this.sb.from(t).select('*').eq('id', id).single(); return data; }
  async where(t, filter) { const { data } = await this.sb.from(t).select('*').match(filter); return data || []; }
  async insert(t, rec) { const { data } = await this.sb.from(t).insert(rec).select().single(); return data; }
  async update(t, id, patch) { const { data } = await this.sb.from(t).update(patch).eq('id', id).select().single(); return data; }
  async remove(t, id) { await this.sb.from(t).delete().eq('id', id); }
  async raw(name, params) { const { data } = await this.sb.rpc(name, params); return data || []; }
}
