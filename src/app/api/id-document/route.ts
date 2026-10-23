import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";

const BUCKET = "id-documents";
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** Whether one of your profiles has its ID uploaded, and checked. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ status: null });
  // RLS: only the profile's owner sees its row.
  const { data } = await supabase.from("id_documents").select("status").eq("profile_id", profileId).maybeSingle();
  return NextResponse.json({ status: data?.status ?? null });
}

/**
 * A delivery & errands provider's ID or driving licence photo, for one of
 * their own profiles. Stored privately (only admins open it, through a
 * short-lived link), so it's written with the service role rather than
 * the user's session. A new upload replaces the old one and the profile
 * goes back to review, since what was checked has changed.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const profileId = form?.get("genericProfileId");
  const file = form?.get("file");
  if (typeof profileId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "genericProfileId and file are required" }, { status: 400 });
  }
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });

  const { data: own } = await supabase
    .from("generic_profiles")
    .select("id, role, moderation_status, categories(slug)")
    .eq("id", profileId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!own || own.role !== "provider" || own.categories?.slug !== "errands") {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const db = createAdminClient();
  // Flat under the user's folder, so account deletion's per-user sweep finds it.
  const path = `${user.id}/${own.id}-${Date.now()}.${ext}`;
  const { error: uploadError } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

  const { data: previous } = await db.from("id_documents").select("path").eq("profile_id", own.id).maybeSingle();
  const { error } = await db
    .from("id_documents")
    .upsert({ profile_id: own.id, path, status: "pending", uploaded_at: new Date().toISOString(), reviewed_at: null });
  if (error) {
    await db.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (previous?.path) await db.storage.from(BUCKET).remove([previous.path]).catch(() => {});
  if (own.moderation_status === "approved") {
    await db.from("generic_profiles").update({ moderation_status: "pending" }).eq("id", own.id);
  }

  return NextResponse.json({ status: "pending" });
}
