import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { genericEffectiveStatus, type GenericMatchAccess } from "@/lib/matching/generic-access";

const INTEREST_WINDOW_DAYS = 14;

/**
 * Same interest state-machine as applyInterest in ./apply-interest.ts, for
 * generic_matches. No email notifications yet for nursing (v1 messaging
 * scope is deliberately minimal) -- in-app notifications only.
 */
export async function applyGenericInterest(access: GenericMatchAccess, categorySlug: string) {
  const status = genericEffectiveStatus(access);
  const otherSide = access.side === "seeker" ? "provider" : "seeker";
  const ownPending = `${access.side}_interested`;
  const otherPending = `${otherSide}_interested`;

  const admin = createAdminClient();
  const updatePayload: Record<string, unknown> = {};
  let notify: { user_id: string; type: string }[] = [];

  if (status === "suggested" || status === "expired") {
    updatePayload.status = ownPending;
    updatePayload.initiated_by = access.side;
    updatePayload.interest_expires_at = new Date(Date.now() + INTEREST_WINDOW_DAYS * 86400000).toISOString();
    const recipientUserId = access.side === "seeker" ? access.providerUserId : access.seekerUserId;
    notify = [{ user_id: recipientUserId, type: "interest_received" }];
  } else if (status === otherPending) {
    updatePayload.status = "mutual";
    updatePayload.responded_at = new Date().toISOString();
    notify = [
      { user_id: access.seekerUserId, type: "interest_accepted" },
      { user_id: access.providerUserId, type: "interest_accepted" },
    ];
  } else if (status === ownPending) {
    return NextResponse.json({ error: "You already expressed interest in this match" }, { status: 409 });
  } else if (status === "mutual") {
    return NextResponse.json({ error: "This match is already mutual" }, { status: 409 });
  } else {
    return NextResponse.json({ error: "This match is no longer active" }, { status: 409 });
  }

  const { data: updated, error } = await admin
    .from("generic_matches")
    .update(updatePayload)
    .eq("id", access.id)
    .select("id, status, initiated_by, interest_expires_at, responded_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (notify.length > 0) {
    await admin.from("notifications").insert(
      notify.map((n) => ({
        ...n,
        payload: { generic_match_id: access.id, category_slug: categorySlug },
      })),
    );
  }

  return NextResponse.json({ match: updated });
}
