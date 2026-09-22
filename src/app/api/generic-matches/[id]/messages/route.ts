import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveGenericMatchAccess } from "@/lib/matching/generic-access";
import { sendEmail, newMessageEmail, activityEmailsEnabled } from "@/lib/email";
import { getPublicOrigin } from "@/lib/site-url";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/voice-notes";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const access = await resolveGenericMatchAccess(supabase, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (access.status !== "mutual") {
    return NextResponse.json({ error: "Chat unlocks once both sides say yes" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("generic_messages")
    .select("id, sender_id, body, audio_path, audio_duration_seconds, created_at, read_at")
    .eq("match_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Voice notes live in a private bucket with no select policy -- only the
  // service role can sign a URL for one, which is exactly the point: a
  // client only ever gets a playable link by going through this
  // match-participancy check first (same as the legacy matches route).
  const audioPaths = (data ?? []).map((m) => m.audio_path).filter((p): p is string => !!p);
  const signedByPath = new Map<string, string>();
  if (audioPaths.length > 0) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage.from("voice-notes").createSignedUrls(audioPaths, SIGNED_URL_TTL_SECONDS);
    for (const s of signed ?? []) {
      if (s.signedUrl && !s.error) signedByPath.set(s.path ?? "", s.signedUrl);
    }
  }

  const messages = (data ?? []).map((m) => ({
    ...m,
    audioUrl: m.audio_path ? (signedByPath.get(m.audio_path) ?? null) : null,
  }));

  return NextResponse.json({ messages });
}

const bodySchema = z.object({ body: z.string().trim().min(1).max(2000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const access = await resolveGenericMatchAccess(supabase, id, user.id);
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
    .from("generic_messages")
    .insert({ match_id: id, sender_id: user.id, body: parsed.data.body })
    .select("id, sender_id, body, created_at, read_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Email the recipient — but only for the first still-unread message in
  // the thread, same debounce rule as the legacy matches/[id]/messages
  // route, so an active back-and-forth doesn't send an email per line.
  if (activityEmailsEnabled()) {
    try {
      const admin = createAdminClient();
      const { count } = await admin
        .from("generic_messages")
        .select("id", { count: "exact", head: true })
        .eq("match_id", id)
        .eq("sender_id", user.id)
        .is("read_at", null);

      if ((count ?? 0) === 1) {
        const recipientUserId = access.side === "seeker" ? access.providerUserId : access.seekerUserId;
        const senderProfileId = access.side === "seeker" ? access.seekerProfileId : access.providerProfileId;

        const [{ data: recipient }, { data: senderProfile }, { data: match }] = await Promise.all([
          admin.from("users").select("email, preferred_language").eq("id", recipientUserId).single(),
          admin.from("generic_profiles").select("full_name").eq("id", senderProfileId).single(),
          admin.from("generic_matches").select("categories(slug)").eq("id", id).single(),
        ]);

        if (recipient?.email) {
          const categorySlug = (match?.categories as unknown as { slug: string } | null)?.slug ?? "";
          const lang = recipient.preferred_language as "en" | "ar" | "fr" | null;
          const locale = lang === "ar" ? "ar" : "en";
          const snippet =
            parsed.data.body.length > 140 ? `${parsed.data.body.slice(0, 140)}…` : parsed.data.body;
          const { subject, html } = newMessageEmail(
            lang,
            senderProfile?.full_name ?? "Someone",
            snippet,
            `${getPublicOrigin(request)}/${locale}/categories/${categorySlug}/messages`,
          );
          await sendEmail(recipient.email, subject, html);
        }
      }
    } catch (err) {
      console.error("[generic-matches messages] new-message email failed:", err);
    }
  }

  return NextResponse.json({ message: data }, { status: 201 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const access = await resolveGenericMatchAccess(supabase, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // RLS (generic_messages_mark_read) already restricts this to the
  // recipient's own inbound messages and only the read_at column.
  const { error } = await supabase
    .from("generic_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("match_id", id)
    .neq("sender_id", user.id)
    .is("read_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
