import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { nursingProviderSchema, nursingSeekerSchema, DEFAULT_LICENSE_VERIFICATION_STATUS } from "@/lib/validation/nursing";
import { tutoringProviderSchema, tutoringSeekerSchema } from "@/lib/validation/tutoring";
import { nannyProviderSchema, nannySeekerSchema } from "@/lib/validation/nanny";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";
import { sendEmail, pendingReviewEmail } from "@/lib/email";
import { ownProfilePhotoObject, storageOwnPathFromPublicUrl } from "@/lib/storage-cleanup";

type GenericRole = "seeker" | "provider";

// Registry so each category plugs in its own schemas here without
// touching the request-handling logic below.
const CATEGORY_SCHEMAS: Record<string, { seeker: z.ZodTypeAny; provider: z.ZodTypeAny }> = {
  nanny: { seeker: nannySeekerSchema, provider: nannyProviderSchema },
  nursing: { seeker: nursingSeekerSchema, provider: nursingProviderSchema },
  tutoring: { seeker: tutoringSeekerSchema, provider: tutoringProviderSchema },
};

const ROLE_LABEL: Record<GenericRole, { en: string; ar: string }> = {
  seeker: { en: "seeker", ar: "باحث عن الخدمة" },
  provider: { en: "provider", ar: "مقدّم الخدمة" },
};

async function notifyAdminsOfPendingReview(
  fullName: string,
  profileType: string,
  category: { name_en: string; name_ar: string },
  role: GenericRole,
) {
  const admin = createAdminClient();
  const { data: admins } = await admin
    .from("users")
    .select("id, email, preferred_language, notify_new_profiles")
    .eq("role", "admin");

  if (!admins || admins.length === 0) return;

  // The in-app bell entry still goes to every admin -- only the email is
  // opt-out-able, per-admin (notify_new_profiles). Same convention as the
  // nanny/parent side in /api/profile/route.ts, which this mirrors --
  // this route used to skip the email entirely.
  await admin.from("notifications").insert(
    admins.map((a) => ({
      user_id: a.id,
      type: "profile_pending_review" as const,
      payload: { profile_type: profileType, full_name: fullName },
    })),
  );

  const kind = {
    en: `${category.name_en} · ${ROLE_LABEL[role].en}`,
    ar: `${category.name_ar} · ${ROLE_LABEL[role].ar}`,
  };

  await Promise.all(
    admins
      .filter((a) => a.email && a.notify_new_profiles)
      .map((a) => {
        const { subject, html } = pendingReviewEmail(a.preferred_language, fullName, kind);
        return sendEmail(a.email!, subject, html);
      }),
  );
}

async function resolveCategory(supabase: Awaited<ReturnType<typeof createClient>>, slug: string) {
  const { data } = await supabase
    .from("categories")
    .select("id, slug, status, name_en, name_ar")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

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

const PHOTO_BUCKET = "generic-photos";
// Profiles that can't be submitted without a photo (nannies always had to
// have one before going active).
const PHOTO_REQUIRED = new Set(["nanny:provider"]);

export async function POST(request: Request) {
  return upsertGenericProfile(request, "create");
}

export async function PATCH(request: Request) {
  return upsertGenericProfile(request, "update");
}

async function upsertGenericProfile(request: Request, mode: "create" | "update") {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

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
  // shared per-account state on users; everything else lives in
  // attributes jsonb.
  const { fullName, contactPhone, locationId, ...rest } = p;
  const attributes: Record<string, unknown> = { ...rest };
  if (categorySlug === "nursing" && role === "provider" && mode === "create") {
    attributes.licenseVerificationStatus = DEFAULT_LICENSE_VERIFICATION_STATUS;
  }

  const db = createAdminClient();

  // Read before the write: the current photo decides whether a submitted
  // profilePhotoUrl is a change, and a replaced photo's old file is removed
  // once the new one is saved. The row usually exists even on "create"
  // (claimed as a draft when the role was picked).
  const { data: before } = await db
    .from("generic_profiles")
    .select("profile_photo_url")
    .eq("user_id", user.id)
    .eq("category_id", category.id)
    .eq("role", role)
    .maybeSingle();
  const previousPhotoUrl = before?.profile_photo_url ?? null;

  // Optional; omitted (or unchanged) means "leave the current photo alone".
  // A new one is checked here rather than left to the
  // generic_profiles_protect_photo trigger, since the upsert below runs as
  // the service role, which that trigger skips: only a URL into this
  // user's own generic-photos folder (what /api/profile/photo hands back)
  // is accepted.
  const rawPhotoUrl = body?.profilePhotoUrl;
  let profilePhotoUrl: string | undefined;
  if (rawPhotoUrl !== undefined && rawPhotoUrl !== previousPhotoUrl) {
    if (typeof rawPhotoUrl !== "string" || !storageOwnPathFromPublicUrl(rawPhotoUrl, PHOTO_BUCKET, user.id)) {
      return NextResponse.json({ error: "Invalid profile photo" }, { status: 400 });
    }
    profilePhotoUrl = rawPhotoUrl;
  }

  if (PHOTO_REQUIRED.has(`${categorySlug}:${role}`) && !(profilePhotoUrl ?? previousPhotoUrl)) {
    return NextResponse.json({ error: "A profile photo is required" }, { status: 400 });
  }

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
    ...(profilePhotoUrl !== undefined && { profile_photo_url: profilePhotoUrl }),
  };

  const { data, error } = await db
    .from("generic_profiles")
    .upsert(payload, { onConflict: "user_id,category_id,role" })
    .select("id, role, full_name, location_id, attributes, status, moderation_status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: mode === "create" ? 400 : 409 });
  }

  if (profilePhotoUrl !== undefined && previousPhotoUrl) {
    // Only ever delete a path under this user's own folder -- same guard as
    // /api/profile/photo. Best-effort: never fails a save that succeeded.
    const previous = ownProfilePhotoObject(previousPhotoUrl, user.id);
    if (previous) await db.storage.from(previous.bucket).remove([previous.path]).catch(() => {});
  }

  await supabase.from("users").update({ contact_phone: contactPhone ?? null }).eq("id", user.id);
  await recomputeGenericMatchesForProfile(data.id);
  await notifyAdminsOfPendingReview(fullName, `${categorySlug}_${role}`, category, role);

  return NextResponse.json({ profile: data }, { status: mode === "create" ? 201 : 200 });
}
