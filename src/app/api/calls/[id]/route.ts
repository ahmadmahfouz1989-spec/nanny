import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { resolveMatchAccess } from "@/lib/matching/match-access";
import { iceServers } from "@/lib/ice-servers";
import { cancelRinging, profileCard, pushMissedCall, ringCutoff, type CallStatus } from "@/lib/calls";

type Ctx = { params: Promise<{ id: string }> };

const actionSchema = z.object({ action: z.enum(["accept", "decline", "busy", "end", "failed"]) });

/** The call, if you're one of its two people (RLS). */
async function load(id: string) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) } as const;
  if (!z.uuid().safeParse(id).success) return { error: NextResponse.json({ error: "Call not found" }, { status: 404 }) } as const;
  const { data: call } = await supabase
    .from("calls")
    .select("id, match_id, caller_id, callee_id, status, created_at, answered_at")
    .eq("id", id)
    .maybeSingle();
  if (!call) return { error: NextResponse.json({ error: "Call not found" }, { status: 404 }) } as const;
  return { supabase, user, call } as const;
}

/** Who's on the other end -- for the call screen of a call that just rang in. */
export async function GET(_request: Request, { params }: Ctx) {
  const loaded = await load((await params).id);
  if ("error" in loaded) return loaded.error;
  const { supabase, user, call } = loaded;
  const access = await resolveMatchAccess(supabase, call.match_id, user.id);
  const counterpart = access ? await profileCard(createAdminClient(), access.otherProfileId) : { name: "", photoUrl: null };
  const ringing = call.status === "ringing" && call.created_at >= ringCutoff();
  return NextResponse.json({
    call: { id: call.id, matchId: call.match_id, createdAt: call.created_at, status: ringing || call.status !== "ringing" ? call.status : "missed" },
    counterpart,
  });
}

/**
 * Moves a call along: the callee accepts, declines or is busy; either side
 * ends it (before an answer, the caller hanging up makes it a missed
 * call); "failed" when the two phones couldn't connect. Body as JSON, or
 * as text from navigator.sendBeacon when the page is closing.
 */
export async function POST(request: Request, { params }: Ctx) {
  const loaded = await load((await params).id);
  if ("error" in loaded) return loaded.error;
  const { user, call } = loaded;

  const raw = await request.text().catch(() => "");
  const parsed = actionSchema.safeParse((() => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { action } = parsed.data;

  const isCaller = call.caller_id === user.id;
  const now = new Date().toISOString();
  const db = createAdminClient();

  // Each move only applies from the state it expects, so two phones
  // racing (an answer as the caller gives up) settle on one outcome.
  async function move(from: CallStatus[], to: CallStatus, extra: Record<string, string> = {}) {
    const { data } = await db
      .from("calls")
      .update({ status: to, ...extra })
      .eq("id", call.id)
      .in("status", from)
      .select("status")
      .maybeSingle();
    return data?.status ?? null;
  }

  let status: string | null = null;
  switch (action) {
    case "accept": {
      if (isCaller) return NextResponse.json({ error: "Not your call to answer" }, { status: 403 });
      if (call.created_at < ringCutoff()) {
        await move(["ringing"], "missed", { ended_at: now });
        return NextResponse.json({ error: "The call ended", status: "missed" }, { status: 409 });
      }
      status = await move(["ringing"], "active", { answered_at: now });
      if (!status) return NextResponse.json({ error: "The call ended", status: call.status }, { status: 409 });
      // The callee's other phones stop ringing.
      cancelRinging(call.id, call.callee_id, "answered");
      return NextResponse.json({ status, iceServers: await iceServers() });
    }
    case "decline":
    case "busy":
      if (isCaller) return NextResponse.json({ error: "Not your call to decline" }, { status: 403 });
      status = await move(["ringing"], action === "busy" ? "busy" : "declined", { ended_at: now });
      if (status) cancelRinging(call.id, call.callee_id, "declined");
      break;
    case "end":
      if (call.status === "ringing") {
        status = isCaller ? await move(["ringing"], "missed", { ended_at: now }) : await move(["ringing"], "declined", { ended_at: now });
        if (status === "missed") pushMissedCall(call.id);
        if (status) cancelRinging(call.id, call.callee_id, isCaller ? "ended" : "declined");
      } else {
        status = await move(["active"], "ended", { ended_at: now });
      }
      break;
    case "failed":
      status = await move(["ringing", "active"], "failed", { ended_at: now });
      if (status && call.status === "ringing") cancelRinging(call.id, call.callee_id, "ended");
      break;
  }

  return NextResponse.json({ status: status ?? call.status });
}
