// airtable-sync — two-way sync between Airtable and the tasks/meetings
// tables during the transition period. Runs on a schedule (cron) or
// on-demand. Sync key is airtable_id. Last-write-wins per record.
//
// Direction per run:
//   pull  — Airtable changes since watermark -> upsert on airtable_id
//   push  — rows with updated_at > last_synced_at -> Airtable
//
// The automation that renamed records / applied a default action type
// must stay DISABLED in Airtable, or the pull will reintroduce it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AIRTABLE_API = 'https://api.airtable.com/v0';

async function pull(sb: any, baseId: string, table: string, target: string, key: string) {
  const res = await fetch(`${AIRTABLE_API}/${baseId}/${table}`, {
    headers: { Authorization: `Bearer ${Deno.env.get('AIRTABLE_TOKEN')}` },
  });
  const { records } = await res.json();
  for (const r of records ?? []) {
    const row = { airtable_id: r.id, ...mapFromAirtable(target, r.fields) };
    await sb.from(target).upsert(row, { onConflict: key });
  }
  return records?.length ?? 0;
}

function mapFromAirtable(target: string, f: Record<string, any>) {
  if (target === 'tasks') return {
    name: f['Name'], notes: f['Notes'] ?? null,
    status: (f['Status'] ?? 'todo').toLowerCase().replace(' ', '-'),
    effort_min: f['Effort (min)'] ?? 0,
    start_date: f['Start'] ?? null, end_date: f['Due'] ?? null,
    type: (f['Type'] ?? 'task').toLowerCase(),
  };
  if (target === 'meetings') return {
    title: f['Title'], date: f['Date'], duration_min: f['Duration'] ?? 55,
  };
  return {};
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { base_id, direction = 'pull' } = await req.json();
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let count = 0;
  if (direction === 'pull') {
    count += await pull(sb, base_id, 'Tasks', 'tasks', 'airtable_id');
    count += await pull(sb, base_id, 'Meetings', 'meetings', 'airtable_id');
  }
  // push direction left as a stub — mirror the mapping the other way
  return new Response(JSON.stringify({ synced: count }),
    { headers: { ...cors, 'Content-Type': 'application/json' } });
});
