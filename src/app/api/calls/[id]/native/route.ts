import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelRinging, validCallActionToken } from "@/lib/calls";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ token: z.string().min(20).max(100), action: z.enum(["decline", "end", "reached"]) });

/**
 * Decline or hang up from the phone itself (or say it's ringing) -- iOS CallKit's buttons, or
 * Decline on Android's incoming-call notification -- when the web page may
 * not be running. No session: the ring carried a token for this call and
 * callee (callActionToken), which is the proof.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const { data: call } = await db.from("calls").select("id, callee_id, status").eq("id", id).maybeSingle();
  if (!call || !validCallActionToken(call.id, call.callee_id, parsed.data.token)) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  // The phone is ringing: the caller's screen says so.
  if (parsed.data.action === "reached") {
    await db.from("calls").update({ reached_at: now }).eq("id", call.id).eq("status", "ringing").is("reached_at", null);
    return NextResponse.json({ status: call.status });
  }
  const to = call.status === "ringing" ? "declined" : call.status === "active" && parsed.data.action === "end" ? "ended" : null;
  if (!to) return NextResponse.json({ status: call.status });

  const { data } = await db
    .from("calls")
    .update({ status: to, ended_at: now })
    .eq("id", call.id)
    .eq("status", call.status)
    .select("status")
    .maybeSingle();
  if (data && to === "declined") cancelRinging(call.id, call.callee_id, "declined");
  return NextResponse.json({ status: data?.status ?? call.status });
}
