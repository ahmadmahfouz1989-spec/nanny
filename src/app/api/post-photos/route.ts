import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";

export const POST_PHOTO_BUCKET = "post-photos";
const MAX_BYTES = 8 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/**
 * One photo for a Home post, picked from the phone or taken with the
 * camera, uploaded before the post is sent. Public (posts are), under the
 * poster's own folder: a post may only list photos from there (checked by
 * POST /api/posts and by the posts_check_photos trigger).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JPG, PNG or WebP photo", code: "type" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photo too large (max 8MB)", code: "size" }, { status: 400 });

  const path = `${user.id}/${randomUUID()}.${ext}`;
  const db = createAdminClient();
  const { error } = await db.storage.from(POST_PHOTO_BUCKET).upload(path, file, { contentType: file.type });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data } = db.storage.from(POST_PHOTO_BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl }, { status: 201 });
}
