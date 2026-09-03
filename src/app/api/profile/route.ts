import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parentProfileSchema, nannyProfileSchema } from "@/lib/validation/profile";
import { recomputeMatchesForParent, recomputeMatchesForNanny } from "@/lib/matching/recompute";
import { sendEmail, pendingReviewEmail } from "@/lib/email";

async function notifyAdminsOfPendingReview(fullName: string, profileType: "parent" | "nanny") {
  const admin = createAdminClient();
  const { data: admins } = await admin.from("users").select("id, email, preferred_language").eq("role", "admin");

  if (!admins || admins.length === 0) return;

  await admin.from("notifications").insert(
    admins.map((a) => ({
      user_id: a.id,
      type: "profile_pending_review" as const,
      payload: { profile_type: profileType, full_name: fullName },
    })),
  );

  await Promise.all(
    admins
      .filter((a) => a.email)
      .map((a) => {
        const { subject, html } = pendingReviewEmail(a.preferred_language, fullName, profileType);
        return sendEmail(a.email!, subject, html);
      }),
  );
}

async function getRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from("users").select("role").eq("id", userId).single();
  return data?.role as "parent" | "nanny" | "admin" | undefined;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const role = await getRole(supabase, user.id);

  const { data: userRow } = await supabase.from("users").select("contact_phone").eq("id", user.id).single();

  if (role === "parent") {
    const { data } = await supabase
      .from("parent_profiles")
      .select("*, parent_profile_languages(language_id)")
      .eq("user_id", user.id)
      .maybeSingle();
    return NextResponse.json({ profile: data && { ...data, contact_phone: userRow?.contact_phone ?? null } });
  }

  if (role === "nanny") {
    const { data } = await supabase
      .from("nanny_profiles")
      .select("*, nanny_profile_languages(language_id), nanny_experience(age_group, years_experience)")
      .eq("user_id", user.id)
      .maybeSingle();
    return NextResponse.json({ profile: data && { ...data, contact_phone: userRow?.contact_phone ?? null } });
  }

  return NextResponse.json({ error: "No profile for this role" }, { status: 404 });
}

export async function POST(request: Request) {
  return upsertProfile(request, "create");
}

export async function PATCH(request: Request) {
  return upsertProfile(request, "update");
}

async function upsertProfile(request: Request, mode: "create" | "update") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const role = await getRole(supabase, user.id);
  const body = await request.json().catch(() => null);

  if (role === "parent") {
    const parsed = parentProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const p = parsed.data;
    const fn = mode === "create" ? "create_parent_profile" : "update_parent_profile";
    const { data, error } = await supabase.rpc(fn, {
      p_full_name: p.fullName,
      p_location_id: p.locationId,
      p_location_detail: p.locationDetail,
      p_num_children: p.numChildren,
      p_children_age_ranges: p.childrenAgeRanges,
      p_schedule_type: p.scheduleType,
      p_needed_days: p.neededDays,
      p_live_arrangement: p.liveArrangement,
      p_desired_start_date: p.desiredStartDate,
      p_transportation_required: p.transportationRequired,
      p_additional_duties: p.additionalDuties,
      p_family_description: p.familyDescription ?? null,
      p_language_ids: p.languageIds,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: mode === "create" ? 400 : 409 });
    }
    await supabase.from("users").update({ contact_phone: p.contactPhone ?? null }).eq("id", user.id);
    await supabase.from("parent_profiles").update({ nationality: p.nationality }).eq("user_id", user.id);
    await recomputeMatchesForParent((data as { id: string }).id);
    await notifyAdminsOfPendingReview(p.fullName, "parent");
    return NextResponse.json({ profile: data }, { status: mode === "create" ? 201 : 200 });
  }

  if (role === "nanny") {
    const parsed = nannyProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const p = parsed.data;
    const fn = mode === "create" ? "create_nanny_profile" : "update_nanny_profile";
    const { data, error } = await supabase.rpc(fn, {
      p_full_name: p.fullName,
      p_profile_photo_url: p.profilePhotoUrl,
      p_location_id: p.locationId,
      p_location_detail: p.locationDetail,
      p_work_radius_km: p.workRadiusKm,
      p_employment_type: p.employmentType,
      p_live_arrangement_pref: p.liveArrangementPref,
      p_availability: { days: p.availability.days, start_time: p.availability.startTime, end_time: p.availability.endTime },
      p_years_experience: p.yearsExperience,
      p_has_transportation: p.hasTransportation,
      p_can_drive: p.canDrive,
      p_certifications: p.certifications,
      p_short_intro: p.shortIntro ?? null,
      p_language_ids: p.languageIds,
      p_experience: p.experience.map((e) => ({ age_group: e.ageGroup, years_experience: e.yearsExperience })),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: mode === "create" ? 400 : 409 });
    }
    await supabase.from("users").update({ contact_phone: p.contactPhone ?? null }).eq("id", user.id);
    await supabase.from("nanny_profiles").update({ nationality: p.nationality }).eq("user_id", user.id);
    await recomputeMatchesForNanny((data as { id: string }).id);
    await notifyAdminsOfPendingReview(p.fullName, "nanny");
    return NextResponse.json({ profile: data }, { status: mode === "create" ? 201 : 200 });
  }

  return NextResponse.json({ error: "No profile for this role" }, { status: 404 });
}
