import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicOrigin } from "@/lib/site-url";
import { z } from "zod";

// Email is the only recovery channel -- signup and login are email-only
// too, so there's no phone identity to recover through.
const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const origin = getPublicOrigin(request);

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback-recovery`,
  });

  // Always return a generic success response regardless of whether the
  // email matched an account, to avoid a user-enumeration oracle.
  return NextResponse.json({ status: "recovery_sent_if_account_exists" });
}
