import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What helps a profile get seen and chosen: how complete it is, how many
 * people looked at it, and how responsive the person is. Server only.
 *
 * Views are a count, never who -- the rows exist only to count each viewer
 * once a day, and no client can read them (see the profile_growth
 * migration).
 */

/** Activity figures show only from this many, so one quick chat doesn't define someone. */
export const ACTIVITY_THRESHOLD = 3;

export async function recordProfileView(profileId: string, viewerId: string) {
  await createAdminClient()
    .from("profile_views")
    .upsert({ profile_id: profileId, viewer_id: viewerId }, { ignoreDuplicates: true })
    .then(
      () => {},
      () => {},
    );
}

/** Distinct viewers per day over the last `days` days, summed. */
export async function profileViewCounts(profileIds: string[], days = 30): Promise<Map<string, number>> {
  const out = new Map(profileIds.map((id) => [id, 0]));
  if (profileIds.length === 0) return out;
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data } = await createAdminClient()
    .from("profile_views")
    .select("profile_id")
    .in("profile_id", profileIds)
    .gte("day", since);
  for (const row of data ?? []) out.set(row.profile_id, (out.get(row.profile_id) ?? 0) + 1);
  return out;
}

export type ReplySpeed = "hour" | "hours" | "day" | "days";

export type ProfileActivity = {
  /** People they've had a two-way conversation with (last 90 days), once there are enough. */
  talkedWith: number | null;
  /** How fast they usually reply, once there are enough replies to say. */
  replySpeed: ReplySpeed | null;
};

export async function profileActivity(profileId: string): Promise<ProfileActivity> {
  const { data } = await createAdminClient().rpc("profile_activity_stats", { p_profile_id: profileId });
  const row = data?.[0];
  if (!row) return { talkedWith: null, replySpeed: null };
  const minutes = row.median_reply_minutes === null ? null : Number(row.median_reply_minutes);
  const speed: ReplySpeed | null =
    minutes === null ? null : minutes <= 60 ? "hour" : minutes <= 6 * 60 ? "hours" : minutes <= 24 * 60 ? "day" : "days";
  return {
    talkedWith: Number(row.conversations) >= ACTIVITY_THRESHOLD ? Number(row.conversations) : null,
    replySpeed: Number(row.replies) >= ACTIVITY_THRESHOLD ? speed : null,
  };
}

export type StrengthItem = "photo" | "headline" | "about" | "availability" | "work";

export type ProfileStrength = { percent: number; missing: StrengthItem[] };

/** The parts of a profile people look at first, and which are still empty. */
export function profileStrength(input: {
  role: "seeker" | "provider";
  photoUrl: string | null;
  headline: string | null;
  attributes: Record<string, unknown>;
  hasWork: boolean;
}): ProfileStrength {
  const a = input.attributes;
  const about = [a.shortIntro, a.jobDescription, a.familyDescription].some((v) => typeof v === "string" && v.trim() !== "");
  const availability = a.availability as { days?: unknown } | undefined;
  const days = Array.isArray(availability?.days) ? availability.days : Array.isArray(a.neededDays) ? a.neededDays : [];
  const checks: [StrengthItem, boolean][] = [
    ["photo", !!input.photoUrl],
    ["headline", !!input.headline?.trim()],
    ["about", about],
    ["availability", days.length > 0],
  ];
  if (input.role === "provider") checks.push(["work", input.hasWork]);
  const done = checks.filter(([, ok]) => ok).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter(([, ok]) => !ok).map(([item]) => item),
  };
}
