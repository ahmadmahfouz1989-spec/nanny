import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { effectiveStatus, type MatchAccess } from "@/lib/matching/access";
import { sendEmail, interestReceivedEmail, mutualMatchEmail } from "@/lib/email";
import { getPublicOrigin } from "@/lib/site-url";

const INTEREST_WINDOW_DAYS = 14;

/**
 * The interest state-machine shared by "express interest" on a match card
 * and "I'm interested" on a feed post -- a post is just another front door
 * into the same match row, so it goes through the exact same transition,
 * notifications, and emails rather than a parallel path.
 */
export async function applyInterest(request: Request, access: MatchAccess) {
  const status = effectiveStatus(access);
  const otherSide = access.side === "parent" ? "nanny" : "parent";
  const ownPending = `${access.side}_interested`;
  const otherPending = `${otherSide}_interested`;

  const admin = createAdminClient();
  const updatePayload: Record<string, unknown> = {};
  let notify: { user_id: string; type: string }[] = [];

  if (status === "suggested" || status === "expired") {
    updatePayload.status = ownPending;
    updatePayload.initiated_by = access.side;
    updatePayload.interest_expires_at = new Date(Date.now() + INTEREST_WINDOW_DAYS * 86400000).toISOString();
    const recipientUserId = access.side === "parent" ? access.nannyUserId : access.parentUserId;
    notify = [{ user_id: recipientUserId, type: "interest_received" }];
  } else if (status === otherPending) {
    updatePayload.status = "mutual";
    updatePayload.responded_at = new Date().toISOString();
    notify = [
      { user_id: access.parentUserId, type: "interest_accepted" },
      { user_id: access.nannyUserId, type: "interest_accepted" },
    ];
  } else if (status === ownPending) {
    return NextResponse.json({ error: "You already expressed interest in this match" }, { status: 409 });
  } else if (status === "mutual") {
    return NextResponse.json({ error: "This match is already mutual" }, { status: 409 });
  } else {
    return NextResponse.json({ error: "This match is no longer active" }, { status: 409 });
  }

  // Compare-and-swap on the raw status this decision was based on -- NOT
  // the derived `status` (effectiveStatus can read "expired" off a row
  // whose literal column is still "parent_interested"/"nanny_interested",
  // which would never match a real row and break every expiry re-open).
  // Without this guard at all, two requests racing on the same stale read
  // (e.g. both sides clicking interest at once) would each blindly
  // overwrite the other's transition instead of one landing on "mutual".
  const { data: updated, error } = await admin
    .from("matches")
    .update(updatePayload)
    .eq("id", access.id)
    .eq("status", access.status)
    .select("id, status, initiated_by, interest_expires_at, responded_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "This match just changed — please refresh and try again." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (notify.length > 0) {
    await admin.from("notifications").insert(notify.map((n) => ({ ...n, payload: { match_id: access.id } })));

    const [{ data: recipients }, { data: parentProfile }, { data: nannyProfile }] = await Promise.all([
      admin
        .from("users")
        .select("id, email, preferred_language")
        .in(
          "id",
          notify.map((n) => n.user_id),
        ),
      admin.from("parent_profiles").select("full_name").eq("id", access.parentProfileId).single(),
      admin.from("nanny_profiles").select("full_name").eq("id", access.nannyProfileId).single(),
    ]);

    const recipientById = new Map((recipients ?? []).map((r) => [r.id, r]));

    await Promise.all(
      notify.map((n) => {
        const recipient = recipientById.get(n.user_id);
        if (!recipient?.email) return Promise.resolve();

        if (n.type === "interest_received") {
          const fromName = access.side === "parent" ? parentProfile?.full_name : nannyProfile?.full_name;
          const { subject, html } = interestReceivedEmail(recipient.preferred_language, fromName ?? "Someone");
          return sendEmail(recipient.email, subject, html);
        }

        const isParentRecipient = n.user_id === access.parentUserId;
        const otherName = isParentRecipient ? nannyProfile?.full_name : parentProfile?.full_name;
        const locale = recipient.preferred_language === "ar" ? "ar" : "en";
        const matchUrl = `${getPublicOrigin(request)}/${locale}/messages`;
        const { subject, html } = mutualMatchEmail(recipient.preferred_language, otherName ?? "your match", matchUrl);
        return sendEmail(recipient.email, subject, html);
      }),
    );
  }

  return NextResponse.json({ match: updated });
}
