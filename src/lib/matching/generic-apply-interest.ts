import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { genericEffectiveStatus, type GenericMatchAccess } from "@/lib/matching/generic-access";
import { sendEmail, interestReceivedEmail, mutualMatchEmail } from "@/lib/email";
import { getPublicOrigin } from "@/lib/site-url";

const INTEREST_WINDOW_DAYS = 14;

/**
 * Same interest state-machine as applyInterest in ./apply-interest.ts, for
 * generic_matches.
 */
export async function applyGenericInterest(request: Request, access: GenericMatchAccess, categorySlug: string) {
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

  // Compare-and-swap on the raw status, not the derived `status` --
  // same guard, and the same "expired" pitfall, as applyInterest in
  // ./apply-interest.ts.
  const { data: updated, error } = await admin
    .from("generic_matches")
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
    await admin.from("notifications").insert(
      notify.map((n) => ({
        ...n,
        payload: { generic_match_id: access.id, category_slug: categorySlug },
      })),
    );

    const [{ data: recipients }, { data: profiles }] = await Promise.all([
      admin
        .from("users")
        .select("id, email, preferred_language")
        .in(
          "id",
          notify.map((n) => n.user_id),
        ),
      // Unlike parent_profiles/nanny_profiles, both sides here are rows in
      // the same table, so one query covers whichever names are needed.
      admin.from("generic_profiles").select("id, full_name").in("id", [access.seekerProfileId, access.providerProfileId]),
    ]);

    const recipientById = new Map((recipients ?? []).map((r) => [r.id, r]));
    const nameByProfileId = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    const seekerName = nameByProfileId.get(access.seekerProfileId);
    const providerName = nameByProfileId.get(access.providerProfileId);

    await Promise.all(
      notify.map((n) => {
        const recipient = recipientById.get(n.user_id);
        if (!recipient?.email) return Promise.resolve();

        if (n.type === "interest_received") {
          const fromName = access.side === "seeker" ? seekerName : providerName;
          const { subject, html } = interestReceivedEmail(recipient.preferred_language, fromName ?? "Someone");
          return sendEmail(recipient.email, subject, html);
        }

        const isSeekerRecipient = n.user_id === access.seekerUserId;
        const otherName = isSeekerRecipient ? providerName : seekerName;
        const locale = recipient.preferred_language === "ar" ? "ar" : "en";
        const matchUrl = `${getPublicOrigin(request)}/${locale}/categories/${categorySlug}/messages`;
        const { subject, html } = mutualMatchEmail(recipient.preferred_language, otherName ?? "your match", matchUrl);
        return sendEmail(recipient.email, subject, html);
      }),
    );
  }

  return NextResponse.json({ match: updated });
}
