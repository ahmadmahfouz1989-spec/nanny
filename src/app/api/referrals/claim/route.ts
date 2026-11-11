import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { claimReferral, pointsReleased } from "@/lib/points";

const bodySchema = z.object({
  code: z.string().trim().min(4).max(20),
  source: z.enum(["link", "code", "play_store"]).default("code"),
});

/**
 * "I was invited by this code": right after signing up (the code kept from
 * the invite link or Google Play), or typed in the wallet within the first
 * days. Nothing happens before Points are released.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ result: "invalid" }, { status: 400 });
  if (!(await pointsReleased())) return NextResponse.json({ result: "off" });
  const result = await claimReferral(user.id, parsed.data.code, parsed.data.source);
  return NextResponse.json({ result }, { status: result === "ok" ? 200 : 400 });
}
