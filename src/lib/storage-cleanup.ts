/**
 * Extracts the object path from a Supabase Storage public URL for a given
 * bucket, e.g. ".../storage/v1/object/public/nanny-photos/abc/123.jpg" ->
 * "abc/123.jpg". Returns null if the URL doesn't match that bucket (so a
 * malformed or unexpected URL never turns into removing the wrong file).
 */
export function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

/**
 * Same extraction, but only returns a path when its first segment (the
 * "own user id" folder every upload route writes into) matches `ownerId`.
 * profile_photo_url is client-submitted and validated only as a URL
 * (see nannyProfileSchema/parentProfileSchema) -- nothing stops it from
 * naming another account's real photo. Any code that's about to delete a
 * storage object based on a stored URL must use this, not the plain
 * extractor above, or a forged URL can get an unrelated file deleted.
 */
export function storageOwnPathFromPublicUrl(url: string, bucket: string, ownerId: string): string | null {
  const path = storagePathFromPublicUrl(url, bucket);
  if (!path) return null;
  const [firstSegment] = path.split("/");
  return firstSegment === ownerId ? path : null;
}

// Every bucket a profile photo can live in: new uploads go to
// generic-photos; nanny/parent photos from before nanny moved onto
// generic_profiles stay where they were uploaded.
export const PROFILE_PHOTO_BUCKETS = ["generic-photos", "nanny-photos", "parent-photos"] as const;

/**
 * Locates a stored profile photo URL in whichever photo bucket it lives
 * in, returning its bucket and path only when it's under `ownerId`'s own
 * folder (see storageOwnPathFromPublicUrl for why that check matters).
 */
export function ownProfilePhotoObject(url: string, ownerId: string): { bucket: string; path: string } | null {
  for (const bucket of PROFILE_PHOTO_BUCKETS) {
    const path = storageOwnPathFromPublicUrl(url, bucket, ownerId);
    if (path) return { bucket, path };
  }
  return null;
}
