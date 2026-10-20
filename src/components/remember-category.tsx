"use client";

import { useEffect } from "react";
import { rememberCategory } from "@/lib/last-category";

/** Remembers the service dashboard you're on -- see last-category.ts. */
export default function RememberCategory({ slug }: { slug: string }) {
  useEffect(() => {
    rememberCategory(slug);
  }, [slug]);
  return null;
}
