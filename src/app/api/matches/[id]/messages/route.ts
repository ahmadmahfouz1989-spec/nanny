import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveMatchAccess } from "@/lib/matching/access";
import { sendEmail, newMessageEmail, activityEmailsEnabled } from "@/lib/email";
import { getPublicOrigin } from "@/lib/site-url";

const MESSAGE_PAGE_SIZE = 200;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

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

  // Fetched newest-first and reversed, rather than oldest-first with no
  // bound -- PostgREST's max_rows cap (supabase/config.toml) otherwise
  // silently truncates a long thread to its OLDEST rows, hiding whatever
  // conversation is actually happening now. `before` pages further back
  // in history from there.
  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");

  let query = supabase
    .from("messages")
    .select("id, sender_id, body, audio_path, audio_duration_seconds, created_at, read_at")
    .eq("match_id", id)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const page = (data ?? []).slice().reverse();

  // Voice notes live in a private bucket with no select policy -- only the
  // service role can sign a URL for one, which is exactly the point: a
  // client only ever gets a playable link by going through this
  // match-participancy check first.
  const audioPaths = page.map((m) => m.audio_path).filter((p): p is string => !!p);
  const signedByPath = new Map<string, string>();
  if (audioPaths.length > 0) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage.from("voice-notes").createSignedUrls(audioPaths, 3600);
    for (const s of signed ?? []) {
      if (s.signedUrl && !s.error) signedByPath.set(s.path ?? "", s.signedUrl);
    }
  }

  const messages = page.map((m) => ({
    ...m,
    audioUrl: m.audio_path ? (signedByPath.get(m.audio_path) ?? null) : null,
  }));

  return NextResponse.json({ messages, hasMore: (data ?? []).length === MESSAGE_PAGE_SIZE });
}

const bodySchema = z.object({ body: z.string().trim().min(1).max(2000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

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
  if (activityEmailsEnabled()) {
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
  }

  return NextResponse.json({ message: data }, { status: 201 });
}
