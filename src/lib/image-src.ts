const PUBLIC_STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/`;

/**
 * Whether next/image may resize this photo: only our own public Storage
 * photos (the host next.config.ts allows). Resized, a 40px avatar is a few
 * KB from our server instead of the full photo from Supabase's CDN, whose
 * egress is metered. Anything else (a Google avatar, a blob: preview) is
 * shown as it is.
 */
export function canOptimize(src: string | null | undefined): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && typeof src === "string" && src.startsWith(PUBLIC_STORAGE);
}
