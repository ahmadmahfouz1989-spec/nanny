import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const bodySchema = z.object({
  phone: z.string().regex(/^\+961\d{7,8}$/),
  code: z.string().min(4).max(10),
});

// Simple in-memory rate limit (per phone) — resets on server restart.
// Good enough for MVP single-instance deploys; move to a durable store
// (Redis, or a Postgres table) before scaling to multiple instances.
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

  const { phone, code } = parsed.data;

  if (isRateLimited(phone)) {
    return NextResponse.json({ error: "Too many attempts, try again later" }, { status: 429 });
  }

  const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: "phone_change" });
  if (error) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
  }

  // OTP is now confirmed by Supabase Auth — this route acts as the trusted
  // verifier, so it uses the service-role client to mirror the verified
  // state into public.users / verification (spec §3.9: clients can never
  // set verification.status themselves).
  const admin = createAdminClient();

  await admin
    .from("users")
    .update({ phone, phone_verified_at: new Date().toISOString() })
    .eq("id", user.id);

  await admin.from("verification").insert({
    user_id: user.id,
    type: "phone",
    status: "verified",
    verified_at: new Date().toISOString(),
  });

  return NextResponse.json({ status: "verified" });
}
