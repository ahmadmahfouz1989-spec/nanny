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
