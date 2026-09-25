import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MATCH_SOURCES,
  conversationUrl,
  effectiveStatus,
  matchNotificationPayload,
  profileTableFor,
  type MatchAccess,
} from "@/lib/matching/match-access";
import { sendEmail, interestReceivedEmail, mutualMatchEmail } from "@/lib/email";
import { getPublicOrigin } from "@/lib/site-url";

const INTEREST_WINDOW_DAYS = 14;

/**
 * The interest state-machine for every category -- nanny/parent and
 * generic (nursing, tutoring, ...) matches go through the exact same
 * transition, notifications, and emails.
 */
export async function applyInterest(request: Request, access: MatchAccess) {
  const status = effectiveStatus(access);
  const ownPending = `${access.side}_interested`;
  const otherPending = `${access.otherSide}_interested`;

  const admin = createAdminClient();
  const updatePayload: Record<string, unknown> = {};
  let notify: { user_id: string; type: string }[] = [];

  if (status === "suggested" || status === "expired") {
    updatePayload.status = ownPending;
    updatePayload.initiated_by = access.side;
    updatePayload.interest_expires_at = new Date(Date.now() + INTEREST_WINDOW_DAYS * 86400000).toISOString();
    notify = [{ user_id: access.otherUserId, type: "interest_received" }];
  } else if (status === otherPending) {
    updatePayload.status = "mutual";
    updatePayload.responded_at = new Date().toISOString();
    notify = [
      { user_id: access.myUserId, type: "interest_accepted" },
      { user_id: access.otherUserId, type: "interest_accepted" },
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
  // whose literal column is still "*_interested", which would never match
  // a real row and break every expiry re-open). Without this guard at all,
  // two requests racing on the same stale read (e.g. both sides clicking
  // interest at once) would each blindly overwrite the other's transition
  // instead of one landing on "mutual".
  const { data: updated, error } = await admin
    .from(MATCH_SOURCES[access.source].matchesTable)
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
    const payload = matchNotificationPayload(access);
    await admin.from("notifications").insert(notify.map((n) => ({ ...n, payload })));

    const [{ data: recipients }, { data: myProfile }, { data: otherProfile }] = await Promise.all([
      admin
        .from("users")
        .select("id, email, preferred_language")
        .in(
          "id",
          notify.map((n) => n.user_id),
        ),
      admin.from(profileTableFor(access.source, access.side)).select("full_name").eq("id", access.myProfileId).single(),
      admin
        .from(profileTableFor(access.source, access.otherSide))
        .select("full_name")
        .eq("id", access.otherProfileId)
        .single(),
    ]);

    const recipientById = new Map((recipients ?? []).map((r) => [r.id, r]));

    await Promise.all(
      notify.map((n) => {
        const recipient = recipientById.get(n.user_id);
        if (!recipient?.email) return Promise.resolve();

        if (n.type === "interest_received") {
          const { subject, html } = interestReceivedEmail(recipient.preferred_language, myProfile?.full_name ?? "Someone");
          return sendEmail(recipient.email, subject, html);
        }

        const otherName = n.user_id === access.myUserId ? otherProfile?.full_name : myProfile?.full_name;
        const locale = recipient.preferred_language === "ar" ? "ar" : "en";
        const matchUrl = conversationUrl(getPublicOrigin(request), locale, access.id);
        const { subject, html } = mutualMatchEmail(recipient.preferred_language, otherName ?? "your match", matchUrl);
        return sendEmail(recipient.email, subject, html);
      }),
    );
  }

  return NextResponse.json({ match: updated });
}
