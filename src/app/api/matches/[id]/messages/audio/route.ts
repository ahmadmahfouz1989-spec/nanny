import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveMatchAccess } from "@/lib/matching/access";
import { sendEmail, newMessageEmail } from "@/lib/email";
import { getPublicOrigin } from "@/lib/site-url";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DURATION_SECONDS = 120;
const ALLOWED_TYPES = ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg"];
const SIGNED_URL_TTL_SECONDS = 3600;

// A voice note still needs *something* in the not-null, 1-2000-char body
// column -- kept as a plain, unlocalized fallback for any code path that
// only ever reads .body (the new-message email snippet, for instance),
// not shown to a viewer whose client understands audio_path.
const PLACEHOLDER_BODY = "🎤 Voice note";

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
  if (access.status !== "mutual") {
    return NextResponse.json({ error: "Chat unlocks once both sides say yes" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const durationRaw = formData?.get("durationSeconds");
  const durationSeconds = Math.min(MAX_DURATION_SECONDS, Math.max(0, Number(durationRaw) || 0));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }
  // Defensive: the client already strips any codec suffix (e.g.
  // "audio/webm;codecs=opus" -> "audio/webm") before it ever gets here, but
  // don't depend on every future caller doing that.
  const baseType = file.type.split(";")[0] ?? file.type;
  if (!ALLOWED_TYPES.includes(baseType)) {
    return NextResponse.json({ error: "Unsupported audio format" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Voice note too long (max 5MB)" }, { status: 400 });
  }

  const ext = file.type.split("/")[1]?.split(";")[0] ?? "webm";
  const path = `${user.id}/${id}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("voice-notes").upload(path, file, {
    contentType: baseType,
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      match_id: id,
      sender_id: user.id,
      body: PLACEHOLDER_BODY,
      audio_path: path,
      audio_duration_seconds: Math.round(durationSeconds),
    })
    .select("id, sender_id, body, audio_path, audio_duration_seconds, created_at, read_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: signed } = await admin.storage.from("voice-notes").createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  // Same "email once per unread thread" throttle as a text message.
  try {
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("match_id", id)
      .eq("sender_id", user.id)
      .is("read_at", null);

    if ((count ?? 0) === 1) {
      const recipientUserId = access.side === "parent" ? access.nannyUserId : access.parentUserId;
      const senderTable = access.side === "parent" ? "parent_profiles" : "nanny_profiles";
      const senderProfileId = access.side === "parent" ? access.parentProfileId : access.nannyProfileId;

      const [{ data: recipient }, { data: senderProfile }] = await Promise.all([
        admin.from("users").select("email, preferred_language").eq("id", recipientUserId).single(),
        admin.from(senderTable).select("full_name").eq("id", senderProfileId).single(),
      ]);

      if (recipient?.email) {
        const lang = recipient.preferred_language as "en" | "ar" | "fr" | null;
        const locale = lang === "ar" ? "ar" : "en";
        const { subject, html } = newMessageEmail(
          lang,
          senderProfile?.full_name ?? "Someone",
          PLACEHOLDER_BODY,
          `${getPublicOrigin(request)}/${locale}/messages`,
        );
        await sendEmail(recipient.email, subject, html);
      }
    }
  } catch (err) {
    console.error("[messages/audio] new-message email failed:", err);
  }

  return NextResponse.json({ message: { ...message, audioUrl: signed?.signedUrl ?? null } }, { status: 201 });
}
