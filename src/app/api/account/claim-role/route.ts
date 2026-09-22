import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
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
  const user = await requireActiveUser(supabase);

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

/**
 * Undoes a claim made by mistake -- "I'm a nanny" clicked when they meant
 * "I need a nanny", or just changing their mind mid-wizard before ever
 * submitting. Only allowed while no real parent_profiles/nanny_profiles
 * row exists yet; once one does, the role is locked in for good, same as
 * today -- this never reaches a live profile.
 */
export async function DELETE() {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: current } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
  if (!current?.role) {
    return NextResponse.json({ role: null });
  }

  const [{ count: parentCount }, { count: nannyCount }] = await Promise.all([
    admin.from("parent_profiles").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    admin.from("nanny_profiles").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  if ((parentCount ?? 0) > 0 || (nannyCount ?? 0) > 0) {
    return NextResponse.json({ error: "A profile already exists for this role" }, { status: 409 });
  }

  const { error } = await admin.from("users").update({ role: null }).eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ role: null });
}
