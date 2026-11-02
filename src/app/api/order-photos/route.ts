import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";

export const ORDER_PHOTO_BUCKET = "order-photos";
const MAX_BYTES = 8 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/**
 * One photo of a repair job, uploaded before the request is sent. Stored
 * privately under the customer's own folder; the request then lists the
 * returned path (POST /api/errand-orders checks it's theirs). Only the
 * customer, the tradespeople the request went to, and admins see it,
 * through short-lived links.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JPG, PNG or WebP photo" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photo too large (max 8MB)" }, { status: 400 });

  const path = `${user.id}/${randomUUID()}.${ext}`;
  const db = createAdminClient();
  const { error } = await db.storage.from(ORDER_PHOTO_BUCKET).upload(path, file, { contentType: file.type });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: signed } = await db.storage.from(ORDER_PHOTO_BUCKET).createSignedUrl(path, 3600);
  return NextResponse.json({ path, url: signed?.signedUrl ?? null }, { status: 201 });
}
