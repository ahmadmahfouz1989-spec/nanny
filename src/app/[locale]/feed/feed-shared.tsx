"use client";

import Image from "next/image";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";

export type Post = {
  id: string;
  user_id: string;
  kind: "looking_for" | "offering";
  caption: string;
  created_at: string;
  author: { fullName: string; profileId: string | null; photoUrl: string | null } | null;
  likeCount: number;
  likedByMe: boolean;
  replyCount: number;
  featured: boolean;
  isMine: boolean;
};

export type Reply = {
  id: string;
  user_id: string;
  body: string;
  parent_reply_id: string | null;
  created_at: string;
  authorName: string | null;
  authorPhotoUrl: string | null;
  isMine: boolean;
};

export function formatRelative(iso: string, locale: string, justNow: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (min < 60) return rtf.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (hr < 24) return rtf.format(-hr, "hour");
  return rtf.format(-Math.round(hr / 24), "day");
}

export function Avatar({ photoUrl, size = 44, className = "" }: { photoUrl: string | null; size?: number; className?: string }) {
  return photoUrl ? (
    <Image
      src={photoUrl}
      alt=""
      width={size}
      height={size}
      className={`rounded-full object-cover shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  ) : (
    <AvatarIllustration
      tone="primary"
      className={`rounded-full overflow-hidden shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
