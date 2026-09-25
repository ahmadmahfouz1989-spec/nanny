import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { ownProfilePhotoObject } from "@/lib/storage-cleanup";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET = "generic-photos";

/**
 * Uploads a photo for one of the caller's profiles (`genericProfileId` --
 * an account can hold a profile in several categories, each with its own
 * photo).
 *
 * `stage=true` (the onboarding/edit forms): upload only and return the URL;
 * the form's own Save commits it as profilePhotoUrl via
 * /api/generic-profile, so Cancel leaves the saved profile untouched.
 * Otherwise (the standalone "change photo" control on /profile, which has
 * no separate Save) the profile is updated right away and goes back to
 * review.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const genericProfileId = formData?.get("genericProfileId");
  const file = formData?.get("file");
  const stage = formData?.get("stage") === "true";

  if (typeof genericProfileId !== "string" || !genericProfileId) {
    return NextResponse.json({ error: "genericProfileId is required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  const { data: own } = await supabase
    .from("generic_profiles")
    .select("id, profile_photo_url")
    .eq("id", genericProfileId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!own) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const ext = file.type.split("/")[1];
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(path);

  if (stage) {
    return NextResponse.json({ url: publicUrl.publicUrl });
  }

  const { error: updateError } = await supabase
    .from("generic_profiles")
    .update({ profile_photo_url: publicUrl.publicUrl, moderation_status: "pending" })
    .eq("id", own.id);

  if (updateError) {
    // The upload succeeded but the profile doesn't point at it -- remove the
    // file rather than leave it orphaned.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  // Only remove the old file once the profile actually points at the new
  // one, and only ever a path under this user's own folder.
  const previous = own.profile_photo_url ? ownProfilePhotoObject(own.profile_photo_url, user.id) : null;
  if (previous) await supabase.storage.from(previous.bucket).remove([previous.path]).catch(() => {});

  return NextResponse.json({ url: publicUrl.publicUrl });
}
