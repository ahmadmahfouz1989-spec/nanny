import { NextResponse } from "next/server";
import { DRAFT_NAME } from "@/lib/draft-profile";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { mustVerifyPhone } from "@/lib/phone-gate";
import { carryOver } from "@/lib/profile-carryover";

const bodySchema = z.object({
  categorySlug: z.string().min(1),
  role: z.enum(["seeker", "provider"]),
});

/**
 * Commits to a role in a category the moment it's picked on the role
 * picker, before any real profile fields are filled in -- that's what
 * lets AppShell's nav (see resolveCategoryNav) show this category right
 * away. The placeholder row is
 * `status: 'draft'`, which recomputeGenericMatchesForProfile and the admin
 * moderation queue both already exclude, so it never surfaces as a real
 * profile until the actual onboarding form overwrites it with real data
 * (and flips it to 'active') on submit.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { categorySlug, role } = parsed.data;

  const { data: category } = await supabase
    .from("categories")
    .select("id, status")
    .eq("slug", categorySlug)
    .maybeSingle();
  if (!category || category.status !== "live") {
    return NextResponse.json({ error: "Unknown or inactive category" }, { status: 404 });
  }

  const db = createAdminClient();
  if (await mustVerifyPhone(db, user)) {
    return NextResponse.json({ error: "phone_required" }, { status: 403 });
  }

  const { data: existing } = await db
    .from("generic_profiles")
    .select("id, role, full_name, profile_photo_url, location_id, attributes, status, moderation_status")
    .eq("user_id", user.id)
    .eq("category_id", category.id)
    .eq("role", role)
    .maybeSingle();

  // Re-picking the same role just returns whatever's already there
  // (draft or a fully submitted profile) -- never overwrite real data.
  if (existing) {
    return NextResponse.json({ profile: existing });
  }

  // Someone starting in a second service has already told us who they are
  // and where: start from that rather than asking again.
  const { data: earlier } = await db
    .from("generic_profiles")
    .select("role, full_name, location_id, profile_photo_url, attributes")
    .eq("user_id", user.id)
    .neq("status", "draft")
    .order("updated_at", { ascending: false });
  const { data: account } = await db.from("users").select("full_name, nationality, photo_url").eq("id", user.id).single();
  const carried = carryOver(earlier ?? [], role);

  const { data: created, error } = await db
    .from("generic_profiles")
    .insert({
      user_id: user.id,
      category_id: category.id,
      role,
      full_name: account?.full_name || earlier?.[0]?.full_name?.trim() || DRAFT_NAME,
      location_id: carried.location_id,
      // The account's photo and nationality ("About you") come first.
      profile_photo_url: account?.photo_url ?? carried.profile_photo_url,
      attributes: { ...(carried.attributes as Record<string, unknown>), ...(account?.nationality ? { nationality: account.nationality } : {}) } as typeof carried.attributes,
      status: "draft",
    })
    .select("id, role, full_name, profile_photo_url, location_id, attributes, status, moderation_status")
    .single();

  if (error) {
    // Claimed twice at the same moment (a double tap): the other request
    // made the row -- hand that one back instead of failing.
    if (error.code === "23505") {
      const { data: raced } = await db
        .from("generic_profiles")
        .select("id, role, full_name, profile_photo_url, location_id, attributes, status, moderation_status")
        .eq("user_id", user.id)
        .eq("category_id", category.id)
        .eq("role", role)
        .maybeSingle();
      if (raced) return NextResponse.json({ profile: raced });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ profile: created }, { status: 201 });
}

/**
 * Undoes a claim made by mistake -- "I need a nurse" clicked when they
 * meant "I am a nurse", or just changing their mind before filling
 * anything in. Only ever deletes a still-empty draft (see POST above);
 * a real submitted profile has to go through the normal moderation path,
 * never silently disappears because someone clicked "change role".
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { categorySlug, role } = parsed.data;

  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", categorySlug)
    .maybeSingle();
  if (!category) {
    return NextResponse.json({ error: "Unknown category" }, { status: 404 });
  }

  const db = createAdminClient();
  const { data: removed } = await db
    .from("generic_profiles")
    .delete()
    .eq("user_id", user.id)
    .eq("category_id", category.id)
    .eq("role", role)
    .eq("status", "draft")
    .select("id");
  // An ID photo uploaded before changing their mind: its row went with
  // the draft, its file is removed here (only ever under their own folder).
  if (removed?.length) {
    const { data: files } = await db.storage.from("id-documents").list(user.id);
    const prefixes = removed.map((r) => `${r.id}-`);
    const stale = (files ?? []).filter((f) => prefixes.some((p) => f.name.startsWith(p))).map((f) => `${user.id}/${f.name}`);
    if (stale.length) await db.storage.from("id-documents").remove(stale).catch(() => {});
  }

  return NextResponse.json({ status: "ok" });
}
