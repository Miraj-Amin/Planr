// cascade-schedule — recomputes task dates for a project after a
// dependency or duration change, and writes back the ones that moved.
// The scheduling logic mirrors src/lib/scheduler.js so client and server
// agree. Runs server-side so a change from any client stays consistent.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function addWorkingDays(d: Date, n: number) {
  const r = new Date(d); if (!n) return r;
  const step = n > 0 ? 1 : -1; let rem = Math.abs(n);
  while (rem > 0) { r.setDate(r.getDate() + step); const wd = r.getDay(); if (wd !== 0 && wd !== 6) rem--; }
  return r;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { project_id, project_start } = await req.json();
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: tasks } = await sb.from('tasks').select('*')
    .eq('project_id', project_id).neq('type', 'agenda').neq('type', 'followup');
  const { data: deps } = await sb.from('dependencies').select('*').eq('project_id', project_id);

  // topological cascade (FS/SS/FF/SF + lag) — same rules as the client engine
  const byId = new Map((tasks ?? []).map((t: any) => [t.id, t]));
  const predsOf = new Map((tasks ?? []).map((t: any) => [t.id, [] as any[]]));
  for (const d of deps ?? []) predsOf.get(d.successor_id)?.push(d);

  const indeg = new Map((tasks ?? []).map((t: any) => [t.id, 0]));
  for (const d of deps ?? []) indeg.set(d.successor_id, (indeg.get(d.successor_id) ?? 0) + 1);
  const queue = (tasks ?? []).filter((t: any) => indeg.get(t.id) === 0).map((t: any) => t.id);
  const adj = new Map((tasks ?? []).map((t: any) => [t.id, [] as any[]]));
  for (const d of deps ?? []) adj.get(d.predecessor_id)?.push(d);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!; order.push(id);
    for (const d of adj.get(id) ?? []) { indeg.set(d.successor_id, indeg.get(d.successor_id)! - 1);
      if (indeg.get(d.successor_id) === 0) queue.push(d.successor_id); }
  }

  const resolved = new Map<string, any>();
  const updates: any[] = [];
  for (const id of order) {
    const t = byId.get(id); if (!t) continue;
    const duration = t.duration_days ?? 1;
    let start = t.start_date ?? project_start;
    if (!t.is_scheduled_manually) {
      let earliest: string | null = null;
      for (const dep of predsOf.get(id) ?? []) {
        const pr = resolved.get(dep.predecessor_id); if (!pr) continue;
        let c: string | null = null;
        if (dep.type === 'FS') c = iso(addWorkingDays(new Date(pr.end), 1 + (dep.lag_days || 0)));
        else if (dep.type === 'SS') c = iso(addWorkingDays(new Date(pr.start), dep.lag_days || 0));
        if (c && (!earliest || c > earliest)) earliest = c;
      }
      if (earliest) start = earliest;
    }
    const end = iso(addWorkingDays(new Date(start), duration - 1));
    resolved.set(id, { start, end });
    if (t.start_date !== start || t.end_date !== end)
      updates.push({ id, start_date: start, end_date: end });
  }

  for (const u of updates)
    await sb.from('tasks').update({ start_date: u.start_date, end_date: u.end_date }).eq('id', u.id);

  return new Response(JSON.stringify({ moved: updates.length }),
    { headers: { ...cors, 'Content-Type': 'application/json' } });
});
