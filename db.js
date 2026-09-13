// db.js — single wiring point.
// Swap SupabaseAdapter for LocalAdapter here if you need offline mode.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SupabaseAdapter } from '../data/adapter.js';

export const supabase = createClient(
  'https://aejhlsmcictwoxyalvjb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlamhsc21jaWN0d294eWFsdmpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMjI2ODIsImV4cCI6MjEwNDg5ODY4Mn0.aFLpVdwOZFKX6ubZO9CP0m3vAtxXcZFOapkbjCg23UY'
);

export const db = new SupabaseAdapter(supabase);
