// db.js — single wiring point. Swap the adapter here to change backend.
import { LocalAdapter } from '../data/adapter.js';
import { SEED } from '../data/seed.js';

// LOCAL (default, no backend):
export const db = new LocalAdapter(SEED);

// SUPABASE (when ready):
// import { SupabaseAdapter } from '../data/adapter.js';
// import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// export const db = new SupabaseAdapter(sb);
