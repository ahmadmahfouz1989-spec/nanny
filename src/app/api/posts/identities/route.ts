import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { listPostIdentities, resolveDefaultPostIdentity } from "@/lib/post-identities";

/**
 * Every identity the caller could post the feed under, plus which one to
 * preselect in the composer -- consumed once on mount there. Not returned
 * alongside GET /api/posts itself since it's about the *viewer*, not the
 * page of posts being displayed.
 */
export async function GET() {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const identities = await listPostIdentities(supabase, user.id);
  const defaultIdentity = await resolveDefaultPostIdentity(supabase, user.id, identities);

  return NextResponse.json({ identities, defaultIdentity });
}
