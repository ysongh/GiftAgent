import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

/**
 * Server-side Supabase client using the service-role key. This bypasses RLS,
 * so it must only ever run on the server. Schema lives in db/migrations.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
