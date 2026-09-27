import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { deleteUserAccount } from "@/lib/account-deletion";

const bodySchema = z.object({ confirmEmail: z.string().trim() });

/**
 * A user permanently deletes their own account -- see deleteUserAccount for
 * what goes and what stays. Irreversible, so the request has to carry the
 * account's own email, typed by the user on the confirmation screen; a
 * stray or forged request without it deletes nothing.
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !user.email || parsed.data.confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "Type your account's email to confirm" }, { status: 400 });
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
