import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveMatchAccess, effectiveStatus } from "@/lib/matching/access";
import { ratingAggregateForUser } from "@/lib/ratings";

const bodySchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

function counterpartUserId(access: NonNullable<Awaited<ReturnType<typeof resolveMatchAccess>>>) {
  return access.side === "parent" ? access.nannyUserId : access.parentUserId;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const access = await resolveMatchAccess(supabase, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const { data: mine } = await supabase
    .from("ratings")
    .select("score, comment, updated_at")
    .eq("match_id", id)
    .eq("rater_user_id", user.id)
    .maybeSingle();

  const counterpart = await ratingAggregateForUser(counterpartUserId(access));

  return NextResponse.json({
    mine: mine ?? null,
    counterpart,
    canRate: effectiveStatus(access) === "mutual",
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const access = await resolveMatchAccess(supabase, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (effectiveStatus(access) !== "mutual") {
    return NextResponse.json({ error: "You can rate each other once you've matched" }, { status: 403 });
  }

  const rateeUserId = counterpartUserId(access);

  const { data: saved, error } = await supabase
    .from("ratings")
    .upsert(
      {
        match_id: id,
        rater_user_id: user.id,
        ratee_user_id: rateeUserId,
        score: parsed.data.score,
        comment: parsed.data.comment ?? null,
      },
      { onConflict: "match_id,rater_user_id" },
    )
    .select("score, comment, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Notifications are server-written only (service role). Best-effort.
  const admin = createAdminClient();
  await admin.from("notifications").insert({
    user_id: rateeUserId,
    type: "rating_received",
    payload: { match_id: id, score: parsed.data.score },
  });

  const counterpart = await ratingAggregateForUser(rateeUserId);

  return NextResponse.json({ mine: saved, counterpart });
}
