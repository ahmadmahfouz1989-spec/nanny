import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { startDirectContact } from "@/lib/direct-contact";

const schema = z.object({
  providerProfileId: z.string().uuid(),
  fullName: z.string().trim().max(80).optional(),
});

/** "Message now" on a provider's profile: the conversation to open (see lib/direct-contact.ts). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const result = await startDirectContact(createAdminClient(), user.id, parsed.data.providerProfileId, parsed.data.fullName);
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  return NextResponse.json({ matchId: result.matchId });
}
