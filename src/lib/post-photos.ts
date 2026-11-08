import type { createAdminClient } from "@/lib/supabase/admin";

// Photos on Home posts: public files in the post-photos bucket, each under
// its poster's own folder (see /api/post-photos).

const BUCKET = "post-photos";
export const MAX_POST_PHOTOS = 4;

const prefix = (userId: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${userId}/`;

/** A photo this person uploaded for a post (not someone else's, not an outside link). */
export const isOwnPostPhoto = (url: string, userId: string) => url.startsWith(prefix(userId)) && !url.includes("..");

/** Deletes a post's photo files. Best-effort: never fails what called it. */
export async function removePostPhotos(db: ReturnType<typeof createAdminClient>, userId: string, urls: string[] | null | undefined) {
  const paths = (urls ?? []).filter((u) => isOwnPostPhoto(u, userId)).map((u) => u.slice(prefix(userId).length - userId.length - 1));
  if (paths.length) await db.storage.from(BUCKET).remove(paths).catch(() => {});
}
