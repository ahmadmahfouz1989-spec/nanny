import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/push";

/**
 * Work projects on provider profiles (see the work_projects migration).
 * Reads go through the caller's own client, so RLS decides what's
 * visible; writes go through the service role from the /api/work-projects
 * routes, after the checks here.
 */

export const MAX_PROJECTS_PER_PROFILE = 20;
export const MAX_PHOTOS_PER_PROJECT = 10;
export const WORK_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const WORK_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const WORK_BUCKET = "generic-photos";

export type WorkStatus = "pending" | "approved" | "rejected";

export type WorkPhoto = {
  id: string;
  url: string;
  caption: string | null;
  width: number | null;
  height: number | null;
};

export type WorkProject = {
  id: string;
  title: string;
  description: string | null;
  status: WorkStatus;
  photos: WorkPhoto[];
};

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Work photos sit flat in the owner's folder (`<user id>/work-...`), not a
 * subfolder: account deletion empties each user's folder with a
 * non-recursive listing (src/lib/account-deletion.ts).
 */
export function workPhotoPath(userId: string, projectId: string, ext: string) {
  return `${userId}/work-${projectId}-${Date.now()}.${ext}`;
}

/** Only ever a path the upload route could have written for this user. */
export function isOwnWorkPath(path: string, userId: string) {
  return path.startsWith(`${userId}/work-`) && !path.includes("..");
}

/** A profile's projects, in order, with their photos. RLS decides which. */
export async function loadWork(supabase: SupabaseClient<Database>, profileId: string): Promise<WorkProject[]> {
  const { data } = await supabase
    .from("work_projects")
    .select("id, title, description, status, position, created_at, work_photos(id, url, caption, width, height, position, created_at)")
    .eq("profile_id", profileId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  return (data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status as WorkStatus,
    photos: [...(p.work_photos ?? [])]
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
      .map(({ id, url, caption, width, height }) => ({ id, url, caption, width, height })),
  }));
}

/** The caller's own non-draft provider profile, or null. */
export async function ownProviderProfile(db: Admin, userId: string, profileId: string) {
  const { data } = await db
    .from("generic_profiles")
    .select("id, user_id, role, status")
    .eq("id", profileId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.role !== "provider" || data.status === "draft") return null;
  return data;
}

/** The caller's own project, or null. */
export async function ownProject(db: Admin, userId: string, projectId: string) {
  const { data } = await db
    .from("work_projects")
    .select("id, profile_id, user_id, status, title")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/**
 * After the owner changes what a project shows: it goes back to review,
 * and admins hear about it -- once per trip into the queue, and only when
 * it has a photo to look at (a project with none is still being set up
 * and isn't shown to anyone).
 */
export async function sendBackToReview(
  db: Admin,
  project: { id: string; status: string; title: string },
  { photoAdded = false } = {},
) {
  const wasPending = project.status === "pending";
  if (!wasPending) {
    await db.from("work_projects").update({ status: "pending", reviewed_at: null }).eq("id", project.id);
  }
  const { count } = await db.from("work_photos").select("id", { count: "exact", head: true }).eq("project_id", project.id);
  const photos = count ?? 0;
  // Announce it when it enters the queue with something to look at: an
  // approved/rejected project changed, or a new one got its first photo.
  if ((!wasPending && photos > 0) || (wasPending && photoAdded && photos === 1)) {
    await notifyAdmins(db, project.title);
  }
}

async function notifyAdmins(db: Admin, title: string) {
  const { data: admins } = await db.from("users").select("id").eq("role", "admin");
  if (!admins?.length) return;
  await notify(admins.map((a) => ({ user_id: a.id, type: "work_pending_review", payload: { title } })));
}

/** The photo files of these projects that are safe to delete (under the owner's folder). */
export async function workPhotoPaths(db: Admin, projectIds: string[], userId: string) {
  if (projectIds.length === 0) return [];
  const { data } = await db.from("work_photos").select("path").in("project_id", projectIds);
  return (data ?? []).map((p) => p.path).filter((p) => isOwnWorkPath(p, userId));
}

/**
 * Removes a project's photo files. Call before deleting the rows: the
 * photo rows go with the project's cascade, and with them the paths.
 */
export async function removeProjectFiles(db: Admin, projectIds: string[], userId: string) {
  const paths = await workPhotoPaths(db, projectIds, userId);
  if (paths.length) await db.storage.from(WORK_BUCKET).remove(paths).catch(() => {});
}
