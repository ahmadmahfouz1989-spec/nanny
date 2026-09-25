import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const bodySchema = z.object({
  phone: z.string().regex(/^\+961\d{7,8}$/),
  code: z.string().min(4).max(10),
});

// Same in-memory per-phone limit as /api/auth/verify-phone/confirm (and
// the same single-instance caveat) -- Supabase rate-limits OTP checks
// too, this just stops a guessing loop before it reaches them.
const attempts = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function isRateLimited(phone: string) {
  const now = Date.now();
  const entry = attempts.get(phone);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(phone, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

// Second half of phone recovery (/api/auth/recover sends the SMS): a
// correct code signs the user in via the session cookie, exactly like the
// email recovery link does through /auth/callback-recovery, so the client
// can continue straight to /reset-password.
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const { phone, code } = parsed.data;
  if (isRateLimited(phone)) {
    return NextResponse.json({ error: "Too many attempts, try again later" }, { status: 429 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
  if (error) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
  }

  return NextResponse.json({ status: "verified" });
}
