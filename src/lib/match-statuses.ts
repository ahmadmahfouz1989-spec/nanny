import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";

const MAX_IDS = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MatchStatusRow = { id: string; status: string; interest_expires_at: string | null };

/**
 * Current status of the match cards a results list is showing, so it can
 * pick up changes made by the other person (interest accepted, declined)
 * without refetching and re-paginating the whole list. Request-scoped
 * client: generic_matches_select already limits rows to the caller's own
 * matches, so unknown or foreign ids just don't come back.
 */
export async function matchStatusesResponse(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .filter((id) => UUID.test(id))
    .slice(0, MAX_IDS);
  if (ids.length === 0) return NextResponse.json({ statuses: [] });

  const { data, error } = await supabase.from("generic_matches").select("id, status, interest_expires_at").in("id", ids);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ statuses: (data ?? []) as MatchStatusRow[] });
}
