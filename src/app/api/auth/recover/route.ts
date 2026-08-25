import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicOrigin } from "@/lib/site-url";
import { z } from "zod";

const bodySchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().regex(/^\+961\d{7,8}$/).optional(),
  })
  .refine((data) => data.email || data.phone, { message: "Either email or phone is required" });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const origin = getPublicOrigin(request);

  if (parsed.data.email) {
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${origin}/auth/callback-recovery`,
    });
  } else if (parsed.data.phone) {
    await supabase.auth.signInWithOtp({ phone: parsed.data.phone });
  }

  // Always return a generic success response regardless of whether the
  // identifier matched an account, to avoid a user-enumeration oracle.
  return NextResponse.json({ status: "recovery_sent_if_account_exists" });
}
