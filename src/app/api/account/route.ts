import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteUserAccount } from "@/lib/account-deletion";
import { refreshUserSearchText } from "@/lib/search-text";
import { notifyAdminsOfPendingReview } from "@/lib/admin/pending-review";

// `confirmEmail` is the original field name, kept for old clients.
const bodySchema = z.object({ confirm: z.string().trim().optional(), confirmEmail: z.string().trim().optional() });

const nameSchema = z.object({ fullName: z.string().trim().min(2).max(80) });

const digits = (s: string) => s.replace(/\D/g, "");

/** Whether what was typed is this account's email -- or, for a WhatsApp sign-up with no email, its phone number. */
function matchesAccount(typed: string, user: { email?: string; phone?: string }) {
  if (user.email) return typed.toLowerCase() === user.email.toLowerCase();
  return !!user.phone && digits(typed).length > 0 && digits(typed) === digits(user.phone);
}

/**
 * A user permanently deletes their own account -- see deleteUserAccount for
 * what goes and what stays. Irreversible, so the request has to carry the
 * account's own email (or phone number, for an account without one), typed
 * by the user on the confirmation screen; a stray or forged request without
 * it deletes nothing.
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const typed = parsed.success ? (parsed.data.confirm ?? parsed.data.confirmEmail ?? "") : "";
  if (!typed || !matchesAccount(typed, user)) {
    return NextResponse.json({ error: "Type your account's email or phone number to confirm" }, { status: 400 });
  }

  // Admin accounts are managed separately (and removing the last one would
  // lock everyone out of moderation).
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role === "admin") {
    return NextResponse.json({ error: "Admin accounts can't be deleted here" }, { status: 403 });
  }

  const error = await deleteUserAccount(user.id);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ status: "deleted" });
}

/**
 * Changes the account's name. A database trigger copies it to every profile
 * and sends provider profiles back for review, like any other edit to them.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = nameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  const { fullName } = parsed.data;

  const db = createAdminClient();
  const { data: current } = await db.from("users").select("full_name").eq("id", user.id).single();
  if (current?.full_name === fullName) return NextResponse.json({ ok: true });

  const { error } = await db.from("users").update({ full_name: fullName }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  await refreshUserSearchText(user.id);
  const { data: profile } = await db
    .from("generic_profiles")
    .select("role, moderation_status, categories(slug, name_en, name_ar)")
    .eq("user_id", user.id)
    .eq("role", "provider")
    .neq("status", "draft")
    .limit(1)
    .maybeSingle();
  if (profile?.categories) {
    await notifyAdminsOfPendingReview(fullName, `${profile.categories.slug}_${profile.role}`, profile.categories, profile.role as "seeker" | "provider", {
      // The name changed on a live profile: it stays live, admins check it.
      edited: profile.moderation_status === "approved",
    });
  }
  return NextResponse.json({ ok: true });
}
