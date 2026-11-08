import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";

const BUCKET = "generic-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Uploads the account's photo (About you); saving it is PUT /api/account/basics. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JPG, PNG or WebP photo", code: "type" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photo too large (max 5MB)", code: "size" }, { status: 400 });
  const db = createAdminClient();
  const path = `${user.id}/${Date.now()}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl }, { status: 201 });
}
