import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  categorySlug: z.string().min(1),
  role: z.enum(["seeker", "provider"]),
});

/**
 * Mirrors /api/account/claim-role's job for generic (non-nanny) categories:
 * commit to a role in this category the moment it's picked on the role
 * picker, before any real profile fields are filled in -- that's what
 * lets AppShell's nav (see resolveCategoryNav) show this category right
 * away, same as nanny's users.role claim does. The placeholder row is
 * `status: 'draft'`, which recomputeGenericMatchesForProfile and the admin
 * moderation queue both already exclude, so it never surfaces as a real
 * profile until the actual onboarding form overwrites it with real data
 * (and flips it to 'active') on submit.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const { data: existing } = await db
    .from("generic_profiles")
    .select("id, role, full_name, location_id, attributes, status, moderation_status")
    .eq("user_id", user.id)
    .eq("category_id", category.id)
    .eq("role", role)
    .maybeSingle();

  // Re-picking the same role just returns whatever's already there
  // (draft or a fully submitted profile) -- never overwrite real data.
  if (existing) {
    return NextResponse.json({ profile: existing });
  }

  const { data: created, error } = await db
    .from("generic_profiles")
    .insert({
      user_id: user.id,
      category_id: category.id,
      role,
      full_name: "Draft profile",
      attributes: {},
      status: "draft",
    })
    .select("id, role, full_name, location_id, attributes, status, moderation_status")
    .single();

  if (error) {
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  await db
    .from("generic_profiles")
    .delete()
    .eq("user_id", user.id)
    .eq("category_id", category.id)
    .eq("role", role)
    .eq("status", "draft");

  return NextResponse.json({ status: "ok" });
}
