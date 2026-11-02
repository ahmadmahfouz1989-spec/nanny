import { createAdminClient } from "@/lib/supabase/admin";
import { refreshSearchText } from "@/lib/search-text";
import { notifyAdminsOfPendingReview } from "@/lib/admin/pending-review";
import type { Json } from "@/lib/supabase/database.types";

type Admin = ReturnType<typeof createAdminClient>;

type JobRequest = {
  service: string;
  description: string;
  pickupDistrictId: string;
  pickupAreaId?: string | null;
  pickupDetail?: string;
  timing: string;
  budgetUsd?: number;
  fullName?: string;
};

export type JobProfileResult = { ok: true; profileId: string } | { ok: false; code: "name_required" | "profile_rejected"; error: string };

/**
 * The Home Maintenance request profile a quote request belongs to. Asking
 * for quotes is the request: someone without a maintenance profile gets
 * one made from it (pending review, like any new profile -- quotes don't
 * wait for that), and a draft or paused one is filled in and switched on.
 * The name comes from the form when given, otherwise from the person's
 * other profiles; with neither, the form asks for it.
 */
export async function ensureJobRequestProfile(db: Admin, userId: string, job: JobRequest): Promise<JobProfileResult> {
  const { data: category } = await db.from("categories").select("id, name_en, name_ar").eq("slug", "maintenance").single();
  const { data: existing } = await db
    .from("generic_profiles")
    .select("id, status, moderation_status, full_name")
    .eq("user_id", userId)
    .eq("category_id", category!.id)
    .eq("role", "seeker")
    .maybeSingle();

  if (existing?.moderation_status === "rejected") {
    return { ok: false, code: "profile_rejected", error: "Your Home Maintenance request was turned down. Edit it before asking for quotes." };
  }
  if (existing && existing.status === "active") return { ok: true, profileId: existing.id };

  let name = job.fullName?.trim() || (existing && existing.status !== "draft" ? existing.full_name : "");
  if (!name) {
    const { data: other } = await db
      .from("generic_profiles")
      .select("full_name")
      .eq("user_id", userId)
      .neq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    name = other?.full_name ?? "";
  }
  if (!name) return { ok: false, code: "name_required", error: "Enter your name" };

  const { data: district } = await db.from("locations").select("parent_location_id").eq("id", job.pickupDistrictId).single();
  const attributes: Record<string, Json> = {
    tradesNeeded: [job.service],
    jobDescription: job.description,
    districtId: job.pickupDistrictId,
    areaId: job.pickupAreaId ?? null,
    locationDetail: job.pickupDetail ?? "",
    urgency: job.timing === "asap" ? "urgent" : "flexible",
    neededDays: [],
  };
  if (job.budgetUsd) attributes.budget = { unit: "per_job", maxUsd: job.budgetUsd };
  const row = {
    full_name: name,
    location_id: district?.parent_location_id ?? null,
    attributes,
    status: "active",
    moderation_status: "pending",
  };

  const { data: saved, error } = existing
    ? await db.from("generic_profiles").update(row).eq("id", existing.id).select("id").single()
    : await db
        .from("generic_profiles")
        .insert({ ...row, user_id: userId, category_id: category!.id, role: "seeker" })
        .select("id")
        .single();
  if (error || !saved) throw new Error(`job request profile: ${error?.message}`);

  await refreshSearchText([saved.id]);
  await notifyAdminsOfPendingReview(name, "maintenance_seeker", category!, "seeker");
  return { ok: true, profileId: saved.id };
}
