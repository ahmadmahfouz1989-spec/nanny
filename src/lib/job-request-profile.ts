import { createAdminClient } from "@/lib/supabase/admin";
import { refreshUserSearchText } from "@/lib/search-text";
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
type RequestKind = {
  slug: "maintenance" | "errands";
  /** "Your Home Maintenance request was turned down…" */
  rejected: string;
  /** What the request profile holds, from the order. */
  attributes: (job: JobRequest) => Record<string, Json>;
};

/**
 * The request profile an order belongs to, made from the order itself.
 * Placing an order (or asking for quotes) *is* the request: someone without
 * a profile in that service gets one made from it (pending review, like
 * any new profile -- the order doesn't wait for that), and a draft or
 * paused one is filled in and switched on. An existing live request is
 * left as it is. The name comes from the form when given, otherwise from
 * the person's other profiles; with neither, the form asks for it.
 */
async function ensureRequestProfile(db: Admin, userId: string, job: JobRequest, kind: RequestKind): Promise<JobProfileResult> {
  const { data: category } = await db.from("categories").select("id, name_en, name_ar").eq("slug", kind.slug).single();
  const { data: existing } = await db
    .from("generic_profiles")
    .select("id, status, moderation_status, full_name")
    .eq("user_id", userId)
    .eq("category_id", category!.id)
    .eq("role", "seeker")
    .maybeSingle();

  if (existing?.moderation_status === "rejected") return { ok: false, code: "profile_rejected", error: kind.rejected };
  if (existing && existing.status === "active") return { ok: true, profileId: existing.id };

  let name = job.fullName?.trim() || (existing && existing.status !== "draft" ? existing.full_name : "");
  if (!name) {
    const { data: account } = await db.from("users").select("full_name").eq("id", userId).single();
    name = account?.full_name ?? "";
  }
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
  const row = {
    full_name: name,
    location_id: district?.parent_location_id ?? null,
    attributes: kind.attributes(job),
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
  if (error || !saved) throw new Error(`${kind.slug} request profile: ${error?.message}`);

  await refreshUserSearchText(userId);
  await notifyAdminsOfPendingReview(name, `${kind.slug}_seeker`, category!, "seeker");
  return { ok: true, profileId: saved.id };
}

/** Home Maintenance: asking for quotes makes (or fills in) the maintenance request. */
export function ensureJobRequestProfile(db: Admin, userId: string, job: JobRequest) {
  return ensureRequestProfile(db, userId, job, {
    slug: "maintenance",
    rejected: "Your Home Maintenance request was turned down. Edit it before asking for quotes.",
    attributes: (j) => {
      const attributes: Record<string, Json> = {
        tradesNeeded: [j.service],
        jobDescription: j.description,
        districtId: j.pickupDistrictId,
        areaId: j.pickupAreaId ?? null,
        locationDetail: j.pickupDetail ?? "",
        urgency: j.timing === "asap" ? "urgent" : "flexible",
        neededDays: [],
      };
      if (j.budgetUsd) attributes.budget = { unit: "per_job", maxUsd: j.budgetUsd };
      return attributes;
    },
  });
}

/**
 * Delivery & Errands: placing an order makes (or fills in) the customer's
 * request, so a new customer answers one form, not a request and then an
 * order. The places are the order's (district, area, landmark).
 */
export function ensureErrandRequestProfile(db: Admin, userId: string, order: JobRequest & { dropoffDetail?: string; scheduledAt?: string }) {
  return ensureRequestProfile(db, userId, order, {
    slug: "errands",
    rejected: "Your Delivery & Errands request was turned down. Edit it before ordering.",
    attributes: (o) => {
      const attributes: Record<string, Json> = {
        errandService: o.service,
        jobDescription: o.description,
        districtId: o.pickupDistrictId,
        areaId: o.pickupAreaId ?? null,
        pickupPlace: o.pickupDetail ?? "",
        dropoffPlace: (o as { dropoffDetail?: string }).dropoffDetail ?? "",
        timing: o.timing,
      };
      const scheduledAt = (o as { scheduledAt?: string }).scheduledAt;
      if (o.timing === "scheduled" && scheduledAt) attributes.scheduledAt = scheduledAt;
      if (o.budgetUsd) attributes.budgetUsd = o.budgetUsd;
      return attributes;
    },
  });
}
