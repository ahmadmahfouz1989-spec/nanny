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
