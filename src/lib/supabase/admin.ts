import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * service_role client — bypasses RLS. Server-only; never import from a
 * Client Component or expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 * Reserved for admin routes (spec §5.7) and the matching engine (spec §4.3).
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
