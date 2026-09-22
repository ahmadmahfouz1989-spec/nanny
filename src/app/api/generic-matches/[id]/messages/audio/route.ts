import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveGenericMatchAccess } from "@/lib/matching/generic-access";
import { sendEmail, newMessageEmail, activityEmailsEnabled } from "@/lib/email";
import { getPublicOrigin } from "@/lib/site-url";
import {
  MAX_AUDIO_BYTES,
  MAX_RECORDING_SECONDS,
  ALLOWED_AUDIO_TYPES,
  SIGNED_URL_TTL_SECONDS,
  VOICE_NOTE_PLACEHOLDER_BODY,
} from "@/lib/voice-notes";

// Same `voice-notes` bucket the legacy matches/[id]/messages/audio route
// uses -- its RLS is keyed by "first path segment is your own user id",
// nothing about it is specific to which table the message ends up in.
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

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const durationRaw = formData?.get("durationSeconds");
  const durationSeconds = Math.min(MAX_RECORDING_SECONDS, Math.max(0, Number(durationRaw) || 0));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }
  const baseType = file.type.split(";")[0] ?? file.type;
  if (!ALLOWED_AUDIO_TYPES.includes(baseType)) {
    return NextResponse.json({ error: "Unsupported audio format" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
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
    .from("generic_messages")
    .insert({
      match_id: id,
      sender_id: user.id,
      body: VOICE_NOTE_PLACEHOLDER_BODY,
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
  if (activityEmailsEnabled()) {
    try {
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
          const { subject, html } = newMessageEmail(
            lang,
            senderProfile?.full_name ?? "Someone",
            VOICE_NOTE_PLACEHOLDER_BODY,
            `${getPublicOrigin(request)}/${locale}/categories/${categorySlug}/messages`,
          );
          await sendEmail(recipient.email, subject, html);
        }
      }
    } catch (err) {
      console.error("[generic-matches messages/audio] new-message email failed:", err);
    }
  }

  return NextResponse.json({ message: { ...message, audioUrl: signed?.signedUrl ?? null } }, { status: 201 });
}
