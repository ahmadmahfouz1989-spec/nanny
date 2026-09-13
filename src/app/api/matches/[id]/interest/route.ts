import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveMatchAccess, effectiveStatus } from "@/lib/matching/access";
import { sendEmail, interestReceivedEmail, mutualMatchEmail } from "@/lib/email";
import { getPublicOrigin } from "@/lib/site-url";

const INTEREST_WINDOW_DAYS = 14;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { data: updated, error } = await admin
    .from("matches")
    .update(updatePayload)
    .eq("id", id)
    .select("id, status, initiated_by, interest_expires_at, responded_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (notify.length > 0) {
    await admin.from("notifications").insert(
      notify.map((n) => ({ ...n, payload: { match_id: id } })),
    );

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

        // mutual: the "other" name is whichever profile isn't this recipient's own side
        const isParentRecipient = n.user_id === access.parentUserId;
        const otherName = isParentRecipient ? nannyProfile?.full_name : parentProfile?.full_name;
        const locale = recipient.preferred_language === "ar" ? "ar" : "en";
        const matchUrl = `${getPublicOrigin(request)}/${locale}/messages`;
        const { subject, html } = mutualMatchEmail(
          recipient.preferred_language,
          otherName ?? "your match",
          matchUrl,
        );
        return sendEmail(recipient.email, subject, html);
      }),
    );
  }

  return NextResponse.json({ match: updated });
}
