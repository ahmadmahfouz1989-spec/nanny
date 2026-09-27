import type { Json } from "@/lib/supabase/database.types";

/**
 * generic_profiles.attributes as the plain object it always is. The column
 * is jsonb, so the generated types allow any JSON value; the app only ever
 * writes an object there, and anything else reads as empty.
 */
export function asAttributes(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * A plain object (scores, attributes) as a value for a jsonb column. The
 * app's own types are interfaces, which TypeScript won't match against the
 * generated Json type even though they're plain JSON data.
 */
export function toJson(value: object): JsonObject {
  return value as unknown as JsonObject;
}

export type JsonObject = { [key: string]: Json | undefined };
