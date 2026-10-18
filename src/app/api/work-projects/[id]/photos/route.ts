import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import {
  MAX_PHOTOS_PER_PROJECT,
  WORK_BUCKET,
  WORK_PHOTO_MAX_BYTES,
  WORK_PHOTO_TYPES,
  ownProject,
  workPhotoPath,
} from "@/lib/work";

function dimension(value: FormDataEntryValue | null) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 20000 ? n : null;
}

/**
 * Adds a photo to one of the caller's projects (multipart: file, and
 * optionally caption/width/height).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const captionValue = formData?.get("caption");
  const caption = typeof captionValue === "string" ? captionValue.trim().slice(0, 140) : "";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!WORK_PHOTO_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > WORK_PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  const db = createAdminClient();
  const project = await ownProject(db, user.id, id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: existing } = await db
    .from("work_photos")
    .select("position")
    .eq("project_id", id)
    .order("position", { ascending: false });
  if ((existing?.length ?? 0) >= MAX_PHOTOS_PER_PROJECT) {
    return NextResponse.json({ error: "too_many_photos" }, { status: 400 });
  }

  // Uploaded with the caller's own session, so the bucket's own-folder
  // policy applies on top of the path built here.
  const path = workPhotoPath(user.id, id, file.type.split("/")[1]);
  const { error: uploadError } = await supabase.storage.from(WORK_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }
  const { data: publicUrl } = supabase.storage.from(WORK_BUCKET).getPublicUrl(path);

  const { data: photo, error } = await db
    .from("work_photos")
    .insert({
      project_id: id,
      user_id: user.id,
      path,
      url: publicUrl.publicUrl,
      caption: caption || null,
      width: dimension(formData?.get("width") ?? null),
      height: dimension(formData?.get("height") ?? null),
      position: (existing?.[0]?.position ?? -1) + 1,
    })
    .select("id, url, caption, width, height")
    .single();
  if (error) {
    await supabase.storage.from(WORK_BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ photo });
}
