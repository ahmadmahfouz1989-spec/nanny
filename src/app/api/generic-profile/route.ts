import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nursingProviderSchema, nursingSeekerSchema, DEFAULT_LICENSE_VERIFICATION_STATUS } from "@/lib/validation/nursing";
import { tutoringProviderSchema, tutoringSeekerSchema } from "@/lib/validation/tutoring";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";

type GenericRole = "seeker" | "provider";

// Registry so each category plugs in its own schemas here without
// touching the request-handling logic below.
const CATEGORY_SCHEMAS: Record<string, { seeker: z.ZodTypeAny; provider: z.ZodTypeAny }> = {
  nursing: { seeker: nursingSeekerSchema, provider: nursingProviderSchema },
  tutoring: { seeker: tutoringSeekerSchema, provider: tutoringProviderSchema },
};

async function notifyAdminsOfPendingReview(fullName: string, profileType: string) {
  const admin = createAdminClient();
  const { data: admins } = await admin
    .from("users")
    .select("id, notify_new_profiles")
    .eq("role", "admin");

  if (!admins || admins.length === 0) return;

  await admin.from("notifications").insert(
    admins.map((a) => ({
      user_id: a.id,
      type: "profile_pending_review" as const,
      payload: { profile_type: profileType, full_name: fullName },
    })),
  );
}

async function resolveCategory(supabase: Awaited<ReturnType<typeof createClient>>, slug: string) {
  const { data } = await supabase.from("categories").select("id, slug, status").eq("slug", slug).maybeSingle();
  return data;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const categorySlug = searchParams.get("categorySlug");
  if (!categorySlug) {
    return NextResponse.json({ error: "categorySlug is required" }, { status: 400 });
  }

  const category = await resolveCategory(supabase, categorySlug);
  if (!category) {
    return NextResponse.json({ error: "Unknown category" }, { status: 404 });
  }

  const { data } = await supabase
    .from("generic_profiles")
    .select("id, role, full_name, location_id, attributes, status, moderation_status")
    .eq("user_id", user.id)
    .eq("category_id", category.id);

  return NextResponse.json({ profiles: data ?? [] });
}

export async function POST(request: Request) {
  return upsertGenericProfile(request, "create");
}

export async function PATCH(request: Request) {
  return upsertGenericProfile(request, "update");
}

async function upsertGenericProfile(request: Request, mode: "create" | "update") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const categorySlug = body?.categorySlug as string | undefined;
  const role = body?.role as GenericRole | undefined;

  if (!categorySlug || (role !== "seeker" && role !== "provider")) {
    return NextResponse.json({ error: "categorySlug and role ('seeker' | 'provider') are required" }, { status: 400 });
  }

  const category = await resolveCategory(supabase, categorySlug);
  if (!category || category.status !== "live") {
    return NextResponse.json({ error: "Unknown or inactive category" }, { status: 404 });
  }

  const schemas = CATEGORY_SCHEMAS[categorySlug];
  if (!schemas) {
    return NextResponse.json({ error: "This category has no profile schema yet" }, { status: 404 });
  }

  const schema = role === "seeker" ? schemas.seeker : schemas.provider;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const p = parsed.data as typeof parsed.data & { fullName: string; contactPhone?: string; locationId: string };

  // fullName/locationId are real generic_profiles columns; contactPhone is
  // shared per-account state on users; everything else (including
  // locationDetail/nationality, which are real columns on
  // parent_profiles/nanny_profiles but not on this generic table) lives in
  // attributes jsonb.
  const { fullName, contactPhone, locationId, ...rest } = p;
  const attributes: Record<string, unknown> = { ...rest };
  if (categorySlug === "nursing" && role === "provider" && mode === "create") {
    attributes.licenseVerificationStatus = DEFAULT_LICENSE_VERIFICATION_STATUS;
  }

  const db = createAdminClient();

  if (mode === "create") {
    const { data: existing } = await db
      .from("generic_profiles")
      .select("id")
      .eq("user_id", user.id)
      .eq("category_id", category.id)
      .eq("role", role)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Profile already exists for this role" }, { status: 409 });
    }
  }

  if (mode === "update") {
    const { data: current } = await db
      .from("generic_profiles")
      .select("attributes")
      .eq("user_id", user.id)
      .eq("category_id", category.id)
      .eq("role", role)
      .maybeSingle();
    if (!current) {
      return NextResponse.json({ error: "Profile not found for this role" }, { status: 404 });
    }
    // A provider's license verification status is admin-controlled -- never
    // let a resubmission overwrite it back to "pending".
    if (role === "provider" && current.attributes && typeof current.attributes === "object") {
      const existingStatus = (current.attributes as Record<string, unknown>).licenseVerificationStatus;
      if (existingStatus) attributes.licenseVerificationStatus = existingStatus;
    }
  }

  // status stays "active" and moderation resets to "pending" on every
  // save, including edits -- same convention as update_parent_profile /
  // update_nanny_profile, which always re-queues a resubmission for
  // review regardless of the profile's prior moderation state.
  const payload = {
    user_id: user.id,
    category_id: category.id,
    role,
    full_name: fullName,
    location_id: locationId,
    attributes,
    status: "active",
    moderation_status: "pending",
  };

  const { data, error } = await db
    .from("generic_profiles")
    .upsert(payload, { onConflict: "user_id,category_id,role" })
    .select("id, role, full_name, location_id, attributes, status, moderation_status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: mode === "create" ? 400 : 409 });
  }

  await supabase.from("users").update({ contact_phone: contactPhone ?? null }).eq("id", user.id);
  await recomputeGenericMatchesForProfile(data.id);
  await notifyAdminsOfPendingReview(fullName, `${categorySlug}_${role}`);

  return NextResponse.json({ profile: data }, { status: mode === "create" ? 201 : 200 });
}
