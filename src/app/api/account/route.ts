import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { deleteUserAccount } from "@/lib/account-deletion";

// `confirmEmail` is the original field name, kept for old clients.
const bodySchema = z.object({ confirm: z.string().trim().optional(), confirmEmail: z.string().trim().optional() });

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
