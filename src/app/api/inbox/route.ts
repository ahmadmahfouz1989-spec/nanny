import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { allConversations } from "@/lib/inbox";

/** One conversation list across every category an account is active in. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // The conversation the user has open, so a just-started one (nothing
  // sent yet) stays listed while they write the first message.
  const match = new URL(request.url).searchParams.get("match");
  return NextResponse.json({ conversations: await allConversations(supabase, user.id, match) });
}
