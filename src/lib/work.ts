import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Work projects on provider profiles (see the work_projects migrations).
 * They go live as soon as they have a photo -- no review; admins remove
 * anything that breaks the rules from Admin > Work. Reads go through the
 * caller's own client, so RLS decides what's visible; writes go through
 * the service role from the /api/work-projects routes, after the checks
 * here.
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
  // Already shared to the feed (one post per project).
  shared: boolean;
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

  const ids = (data ?? []).map((p) => p.id);
  const { data: posts } = ids.length
    ? await supabase.from("posts").select("work_project_id").in("work_project_id", ids)
    : { data: [] as { work_project_id: string | null }[] };
  const shared = new Set((posts ?? []).map((p) => p.work_project_id));

  return (data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status as WorkStatus,
    photos: [...(p.work_photos ?? [])]
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
      .map(({ id, url, caption, width, height }) => ({ id, url, caption, width, height })),
    shared: shared.has(p.id),
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
