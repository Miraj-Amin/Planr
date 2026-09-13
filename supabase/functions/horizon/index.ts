// horizon — returns tasks due today or within N days, across all
// projects the caller can see. Wraps the horizon_tasks() SQL function.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const days = Number(url.searchParams.get('days') ?? '7');
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
  );
  const { data, error } = await sb.rpc('horizon_tasks', { p_days: days });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
  return new Response(JSON.stringify(data), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
