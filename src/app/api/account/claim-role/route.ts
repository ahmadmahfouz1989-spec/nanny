import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ role: z.enum(["parent", "nanny"]) });

/**
 * One-time, first-run claim of the legacy childcare role -- signup no
 * longer forces this choice (see signupSchema), so an account can arrive
 * here with users.role still null. Guarded to null-only both in the query
 * (`.is("role", null)`) and by protect_user_role_status at the DB level,
 * which blocks any *other* self-service role change even via a bug here.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("users")
    .update({ role: parsed.data.role })
    .eq("id", user.id)
    .is("role", null)
    .select("role")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!updated) {
    return NextResponse.json({ error: "A role is already set for this account" }, { status: 409 });
  }

  return NextResponse.json({ role: updated.role });
}
