"use client";

import { useEffect } from "react";
import { LAST_CATEGORY_COOKIE } from "@/lib/last-category";

/** Remembers the service dashboard you're on -- see last-category.ts. */
export default function RememberCategory({ slug }: { slug: string }) {
  useEffect(() => {
    document.cookie = `${LAST_CATEGORY_COOKIE}=${slug}; path=/; max-age=31536000; samesite=lax`;
  }, [slug]);
  return null;
}
