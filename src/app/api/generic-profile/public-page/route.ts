import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";

const schema = z.object({ profileId: z.string().uuid(), on: z.boolean() });

/**
 * Switches a provider's shareable public page on or off. Only this one
 * column changes, written with the service role after checking the
 * profile is the caller's -- it isn't an edit of the profile, so it
 * doesn't send it back to review.
 */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data: own } = await supabase
    .from("generic_profiles")
    .select("id, role")
    .eq("id", parsed.data.profileId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!own || own.role !== "provider") return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { error } = await createAdminClient().from("generic_profiles").update({ public_page: parsed.data.on }).eq("id", own.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ publicPage: parsed.data.on });
}
