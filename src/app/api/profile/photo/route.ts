import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { storagePathFromPublicUrl } from "@/lib/storage-cleanup";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const BUCKET_BY_ROLE = { nanny: "nanny-photos", parent: "parent-photos" } as const;
const TABLE_BY_ROLE = { nanny: "nanny_profiles", parent: "parent_profiles" } as const;

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  const role = profile?.role as "nanny" | "parent" | "admin" | undefined;
  if (role !== "nanny" && role !== "parent") {
    return NextResponse.json({ error: "Only parent or nanny accounts have a profile photo" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  // The edit wizard uploads a preview before its own Save/Cancel is
  // resolved -- staged skips writing the profile row (and deleting the
  // still-live previous photo) so Cancel leaves the saved profile
  // untouched. The wizard's own Save then commits profilePhotoUrl as part
  // of its full payload (see /api/profile), which is what actually cleans
  // up the old file. The standalone "change photo" control on /profile has
  // no separate Save step, so it keeps committing immediately.
  const stage = formData?.get("stage") === "true";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  const ext = file.type.split("/")[1];
  const path = `${user.id}/${Date.now()}.${ext}`;
  const bucket = BUCKET_BY_ROLE[role];
  const table = TABLE_BY_ROLE[role];

  // Grab whatever photo is live now so it can be cleaned up after the new
  // one is safely in place -- every re-upload otherwise leaves the old
  // file sitting in the bucket forever with nothing pointing to it.
  const { data: existing } = await supabase.from(table).select("profile_photo_url").eq("user_id", user.id).maybeSingle();
  const previousUrl = existing?.profile_photo_url ?? null;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(path);

  if (stage) {
    return NextResponse.json({ url: publicUrl.publicUrl });
  }

  // No-op (0 rows affected, not an error) during first-time onboarding,
  // before the profile row exists yet -- the wizard's own Finish step
  // still persists profilePhotoUrl as part of profile creation.
  const { error: updateError } = await supabase
    .from(table)
    .update({ profile_photo_url: publicUrl.publicUrl, moderation_status: "pending" })
    .eq("user_id", user.id);

  // Only remove the old file once the new one is uploaded AND the profile
  // row actually points at it -- a failed update must never leave the
  // profile pointing at a file that's already been deleted.
  if (!updateError && previousUrl) {
    const previousPath = storagePathFromPublicUrl(previousUrl, bucket);
    if (previousPath) await supabase.storage.from(bucket).remove([previousPath]).catch(() => {});
  }

  return NextResponse.json({ url: publicUrl.publicUrl });
}
