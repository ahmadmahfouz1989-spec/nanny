import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveMatchAccess } from "@/lib/matching/access";
import { sendEmail, newMessageEmail } from "@/lib/email";
import { getPublicOrigin } from "@/lib/site-url";
import { hasActiveSubscription, subscriptionRequiredResponse } from "@/lib/subscription";

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
  if (access.status !== "mutual") {
    return NextResponse.json({ error: "Chat unlocks once both sides say yes" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at, read_at")
    .eq("match_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ messages: data });
}

const bodySchema = z.object({ body: z.string().trim().min(1).max(2000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await hasActiveSubscription(supabase, user.id))) {
    return subscriptionRequiredResponse();
  }

  const access = await resolveMatchAccess(supabase, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (access.status !== "mutual") {
    return NextResponse.json({ error: "Chat unlocks once both sides say yes" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({ match_id: id, sender_id: user.id, body: parsed.data.body })
    .select("id, sender_id, body, created_at, read_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Email the recipient — but only for the first still-unread message in
  // the thread, so an active back-and-forth doesn't send an email per
  // line. The counter re-arms once they read (which clears read_at on all
  // of the sender's messages).
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("match_id", id)
      .eq("sender_id", user.id)
      .is("read_at", null);

    if ((count ?? 0) === 1) {
      const recipientUserId = access.side === "parent" ? access.nannyUserId : access.parentUserId;
      const senderTable = access.side === "parent" ? "parent_profiles" : "nanny_profiles";
      const senderProfileId =
        access.side === "parent" ? access.parentProfileId : access.nannyProfileId;

      const [{ data: recipient }, { data: senderProfile }] = await Promise.all([
        admin.from("users").select("email, preferred_language").eq("id", recipientUserId).single(),
        admin.from(senderTable).select("full_name").eq("id", senderProfileId).single(),
      ]);

      if (recipient?.email) {
        const lang = recipient.preferred_language as "en" | "ar" | "fr" | null;
        const locale = lang === "ar" ? "ar" : "en";
        const snippet =
          parsed.data.body.length > 140 ? `${parsed.data.body.slice(0, 140)}…` : parsed.data.body;
        const { subject, html } = newMessageEmail(
          lang,
          senderProfile?.full_name ?? "Someone",
          snippet,
          `${getPublicOrigin(request)}/${locale}/messages`,
        );
        await sendEmail(recipient.email, subject, html);
      }
    }
  } catch (err) {
    console.error("[messages] new-message email failed:", err);
  }

  return NextResponse.json({ message: data }, { status: 201 });
}
