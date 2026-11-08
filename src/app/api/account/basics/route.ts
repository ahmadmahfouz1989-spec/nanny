import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { accountBasics } from "@/lib/account-basics";
import { NATIONALITIES } from "@/lib/validation/profile";
import { refreshUserSearchText } from "@/lib/search-text";
import { removeProfilePhotoIfUnused } from "@/lib/storage-cleanup";
import { notifyAdminsOfPendingReview } from "@/lib/admin/pending-review";

const bodySchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
  contactPhone: z
    .string()
    .trim()
    .refine((v) => /^\+?[0-9 ()-]{6,20}$/.test(v), "Enter a phone number"),
  nationality: z.enum(NATIONALITIES, "Choose your nationality"),
  photoUrl: z.string().url().max(500).nullable().optional(),
});

/** The account's basics (see lib/account-basics.ts). */
export async function GET() {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ basics: await accountBasics(createAdminClient(), user.id) });
}

/**
 * Saves the basics and carries them to every profile the account has: the
 * name (through the users trigger), nationality, and the photo. Phone is
 * account-wide already. A live provider profile stays live; admins are
 * told to check a new name or photo, as for any edit.
 */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Check your details", field: issue?.path[0] }, { status: 400 });
  }
  const v = parsed.data;
  const db = createAdminClient();
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generic-photos/${user.id}/`;
  if (v.photoUrl && !v.photoUrl.startsWith(prefix)) return NextResponse.json({ error: "Upload the photo again", field: "photoUrl" }, { status: 400 });

  const before = await accountBasics(db, user.id);
  const { data: old } = await db.from("users").select("photo_url").eq("id", user.id).single();
  const { error } = await db
    .from("users")
    .update({ full_name: v.fullName, contact_phone: v.contactPhone, nationality: v.nationality, ...(v.photoUrl !== undefined ? { photo_url: v.photoUrl } : {}) })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Every profile shows the same person.
  const { data: profiles } = await db
    .from("generic_profiles")
    .select("id, role, status, moderation_status, attributes, profile_photo_url, categories(slug, name_en, name_ar)")
    .eq("user_id", user.id);
  for (const p of profiles ?? []) {
    const attributes = { ...((p.attributes ?? {}) as Record<string, unknown>), nationality: v.nationality };
    await db
      .from("generic_profiles")
      .update({ attributes: attributes as never, ...(v.photoUrl !== undefined ? { profile_photo_url: v.photoUrl } : {}) })
      .eq("id", p.id);
  }
  if (v.photoUrl !== undefined && old?.photo_url && old.photo_url !== v.photoUrl) await removeProfilePhotoIfUnused(db, old.photo_url, user.id);
  await refreshUserSearchText(user.id);

  const changedLook = before.fullName !== v.fullName || (v.photoUrl !== undefined && (old?.photo_url ?? null) !== v.photoUrl);
  const live = (profiles ?? []).find((p) => p.role === "provider" && p.status !== "draft" && p.moderation_status === "approved");
  if (changedLook && live?.categories) {
    await notifyAdminsOfPendingReview(v.fullName, `${live.categories.slug}_provider`, live.categories, "provider", { edited: true });
  }
  return NextResponse.json({ basics: await accountBasics(db, user.id) });
}
