import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const BUCKET_BY_ROLE = { nanny: "nanny-photos", parent: "parent-photos" } as const;
const TABLE_BY_ROLE = { nanny: "nanny_profiles", parent: "parent_profiles" } as const;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(path);

  // Save immediately rather than only staging the URL in onboarding form
  // state -- lets the standalone "change photo" control on /profile update
  // a live profile in one step, with no need to walk the full wizard.
  // No-op (0 rows affected, not an error) during first-time onboarding,
  // before the profile row exists yet -- the wizard's own Finish step
  // still persists profilePhotoUrl as part of profile creation.
  await supabase
    .from(TABLE_BY_ROLE[role])
    .update({ profile_photo_url: publicUrl.publicUrl, moderation_status: "pending" })
    .eq("user_id", user.id);

  return NextResponse.json({ url: publicUrl.publicUrl });
}
