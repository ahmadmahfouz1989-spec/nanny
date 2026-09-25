import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { storageOwnPathFromPublicUrl } from "@/lib/storage-cleanup";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const BUCKET_BY_ROLE = { nanny: "nanny-photos", parent: "parent-photos" } as const;
const TABLE_BY_ROLE = { nanny: "nanny_profiles", parent: "parent_profiles" } as const;

/**
 * Uploads a profile photo. Without `genericProfileId` this is the account's
 * nanny/parent profile (picked by users.role); with it, it's that one
 * generic-category profile (nursing, tutoring, ...) -- an account can hold
 * several of those at once, so the caller has to say which.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const genericProfileId = formData?.get("genericProfileId");

  let bucket: string;
  let table: string;
  let rowFilter: { column: "user_id" | "id"; value: string };

  if (typeof genericProfileId === "string" && genericProfileId) {
    const { data: own } = await supabase
      .from("generic_profiles")
      .select("id")
      .eq("id", genericProfileId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!own) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    bucket = "generic-photos";
    table = "generic_profiles";
    rowFilter = { column: "id", value: own.id };
  } else {
    const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
    const role = profile?.role as "nanny" | "parent" | "admin" | undefined;
    if (role !== "nanny" && role !== "parent") {
      return NextResponse.json({ error: "Only parent or nanny accounts have a profile photo" }, { status: 403 });
    }
    bucket = BUCKET_BY_ROLE[role];
    table = TABLE_BY_ROLE[role];
    rowFilter = { column: "user_id", value: user.id };
  }

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

  // Grab whatever photo is live now so it can be cleaned up after the new
  // one is safely in place -- every re-upload otherwise leaves the old
  // file sitting in the bucket forever with nothing pointing to it.
  const { data: existing } = await supabase
    .from(table)
    .select("profile_photo_url")
    .eq(rowFilter.column, rowFilter.value)
    .maybeSingle();
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
  // still persists profilePhotoUrl as part of profile creation. A genuine
  // failure here (as opposed to that legitimate 0-row case) still sets
  // updateError, though -- Postgres/PostgREST only report zero-rows-matched
  // as success with an empty result, never as an error.
  const { error: updateError } = await supabase
    .from(table)
    .update({ profile_photo_url: publicUrl.publicUrl, moderation_status: "pending" })
    .eq(rowFilter.column, rowFilter.value);

  if (updateError) {
    // The upload already succeeded and the file is live in storage, but the
    // profile row was never updated to point at it -- reporting success
    // here would show the new photo until the next reload silently
    // reverted it, with the just-uploaded file now orphaned either way.
    // Clean it up rather than leaving it to accumulate with nothing
    // pointing at it.
    await supabase.storage.from(bucket).remove([path]).catch(() => {});
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  // Only remove the old file once the new one is uploaded AND the profile
  // row actually points at it -- a failed update must never leave the
  // profile pointing at a file that's already been deleted.
  if (previousUrl) {
    // previousUrl is read back from this profile's own row, but that
    // column is client-submitted elsewhere and only validated as a URL --
    // an earlier forged submission could name another account's real
    // photo. Only ever delete a path under this user's own folder.
    const previousPath = storageOwnPathFromPublicUrl(previousUrl, bucket, user.id);
    if (previousPath) await supabase.storage.from(bucket).remove([previousPath]).catch(() => {});
  }

  return NextResponse.json({ url: publicUrl.publicUrl });
}
