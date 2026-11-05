"use client";

import { useEffect } from "react";
import { request } from "@/lib/request";

// From the browser rather than while rendering, so a page merely prefetched
// by a link doesn't count as opened in the admin's log.
export default function MarkAnnouncementRead({ id }: { id: string }) {
  useEffect(() => {
    void request(`/api/announcements/${id}/read`, { method: "POST" });
  }, [id]);
  return null;
}
