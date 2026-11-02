import { createAdminClient } from "@/lib/supabase/admin";
import { refreshSearchText } from "@/lib/search-text";
import { notifyAdminsOfPendingReview } from "@/lib/admin/pending-review";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";
import type { Json } from "@/lib/supabase/database.types";

type Admin = ReturnType<typeof createAdminClient>;

export type DirectContactResult =
  | { ok: true; matchId: string }
  | { ok: false; status: number; code: "name_required" | "profile_rejected" | "not_available" | "own_profile"; error: string };

/**
 * "Message now" on a provider's profile, for someone who has no request
 * in that service yet -- typically a visitor who just signed up from a
 * shared link. Instead of sending them through the full request form
 * first, this makes a short request profile (their name, and their area
 * from another profile when they have one), pending review like any new
 * profile, and opens the conversation with that provider. They can fill
 * in the details later from the service's dashboard.
 *
 * Someone who already has a request in that service just gets the
 * conversation. Only towards an approved, active provider -- never a
 * seeker, so families can't be approached this way.
 */
export async function startDirectContact(
  db: Admin,
  userId: string,
  providerProfileId: string,
  fullName?: string,
): Promise<DirectContactResult> {
  const { data: provider } = await db
    .from("generic_profiles")
    .select("id, user_id, role, status, moderation_status, category_id, categories(slug, name_en, name_ar)")
    .eq("id", providerProfileId)
    .maybeSingle();
  if (!provider || provider.role !== "provider" || provider.status !== "active" || provider.moderation_status !== "approved") {
    return { ok: false, status: 404, code: "not_available", error: "This profile isn't available to message right now" };
  }
  if (provider.user_id === userId) return { ok: false, status: 400, code: "own_profile", error: "That's your own profile" };

  const { data: existing } = await db
    .from("generic_profiles")
    .select("id, status, moderation_status, full_name")
    .eq("user_id", userId)
    .eq("category_id", provider.category_id)
    .eq("role", "seeker")
    .maybeSingle();
  if (existing?.moderation_status === "rejected") {
    return { ok: false, status: 409, code: "profile_rejected", error: "Your request in this service was turned down. Edit it first." };
  }

  let seekerId = existing?.status === "active" ? existing.id : null;
  if (!seekerId) {
    const { data: other } = await db
      .from("generic_profiles")
      .select("full_name, location_id, attributes")
      .eq("user_id", userId)
      .neq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const name = fullName?.trim() || (existing && existing.status !== "draft" ? existing.full_name : "") || other?.full_name || "";
    if (name.length < 2) return { ok: false, status: 400, code: "name_required", error: "Enter your name" };

    const earlier = (other?.attributes ?? {}) as Record<string, unknown>;
    const attributes: Record<string, Json> = { quickContact: true };
    for (const key of ["districtId", "areaId"]) {
      if (typeof earlier[key] === "string") attributes[key] = earlier[key] as string;
    }
    const row = { full_name: name, location_id: other?.location_id ?? null, attributes, status: "active", moderation_status: "pending" };
    const { data: saved, error } = existing
      ? await db.from("generic_profiles").update(row).eq("id", existing.id).select("id").single()
      : await db
          .from("generic_profiles")
          .insert({ ...row, user_id: userId, category_id: provider.category_id, role: "seeker" })
          .select("id")
          .single();
    if (error || !saved) throw new Error(`direct contact profile: ${error?.message}`);
    seekerId = saved.id;
    await Promise.all([refreshSearchText([saved.id]), recomputeGenericMatchesForProfile(saved.id)]);
    if (provider.categories) await notifyAdminsOfPendingReview(name, `${provider.categories.slug}_seeker`, provider.categories, "seeker");
  }

  // Usually made by the recompute above; created here when scoring left it out.
  const { data: match } = await db
    .from("generic_matches")
    .select("id")
    .eq("seeker_profile_id", seekerId)
    .eq("provider_profile_id", provider.id)
    .maybeSingle();
  if (match) return { ok: true, matchId: match.id };
  const { data: made, error } = await db
    .from("generic_matches")
    .insert({ category_id: provider.category_id, seeker_profile_id: seekerId, provider_profile_id: provider.id, score: 0, score_breakdown: { source: "direct" } })
    .select("id")
    .single();
  if (error || !made) throw new Error(`direct contact match: ${error?.message}`);
  return { ok: true, matchId: made.id };
}
