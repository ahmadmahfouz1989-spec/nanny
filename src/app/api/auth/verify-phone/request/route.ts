import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const bodySchema = z.object({ phone: z.string().regex(/^\+961\d{7,8}$/) });

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

  // Requires an SMS provider configured in the Supabase project's Auth
  // settings (e.g. Twilio) — an operational step, not something this route
  // can fulfill on its own (spec §7.1, §11).
  const { error } = await supabase.auth.updateUser({ phone: parsed.data.phone });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ status: "otp_sent" });
}
