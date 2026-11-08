import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { allConversations } from "@/lib/inbox";
import { createAdminClient } from "@/lib/supabase/admin";

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
  // Their app or website is open (every page checks this): what was sent to
  // them has arrived -- the second, grey tick on the sender's side.
  await createAdminClient().rpc("mark_messages_delivered", { p_user: user.id });
  return NextResponse.json({ conversations: await allConversations(supabase, user.id, match) });
}
