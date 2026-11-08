import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdminsOfPendingReview, providerStatusAfterEdit } from "@/lib/admin/pending-review";
import { removeProfilePhotoIfUnused } from "@/lib/storage-cleanup";

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
    .select("id, role, profile_photo_url, moderation_status, full_name, status, categories(slug, name_en, name_ar)")
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

  // A live provider stays live with a new photo (admins are told to check
  // it); a provider not yet approved goes (back) to review. A customer's
  // request stays as it is. Service role: only it may keep "approved".
  const status = own.role === "provider" ? providerStatusAfterEdit(own.moderation_status) : null;
  const { error: updateError } = await createAdminClient()
    .from("generic_profiles")
    .update(status ? { profile_photo_url: publicUrl.publicUrl, moderation_status: status } : { profile_photo_url: publicUrl.publicUrl })
    .eq("id", own.id);
  if (!updateError && own.role === "provider" && own.status !== "draft" && own.categories) {
    await notifyAdminsOfPendingReview(own.full_name, `${own.categories.slug}_provider`, own.categories, "provider", { edited: status === "approved" });
  }

  if (updateError) {
    // The upload succeeded but the profile doesn't point at it -- remove the
    // file rather than leave it orphaned.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  // Only remove the old file once the profile actually points at the new
  // one, and only ever a path under this user's own folder.
  if (own.profile_photo_url) await removeProfilePhotoIfUnused(createAdminClient(), own.profile_photo_url, user.id);

  return NextResponse.json({ url: publicUrl.publicUrl, moderationStatus: status ?? undefined });
}
