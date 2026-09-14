"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";

type MyPost = {
  id: string;
  kind: "looking_for" | "offering";
  caption: string;
  status: "open" | "closed";
  created_at: string;
  likeCount: number;
  replyCount: number;
};

function formatRelative(iso: string, locale: string, justNow: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (min < 60) return rtf.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (hr < 24) return rtf.format(-hr, "hour");
  return rtf.format(-Math.round(hr / 24), "day");
}

/** A user's own post history, with a real delete — not just "close" — on /profile. */
export default function MyPostsCard() {
  const t = useTranslations("Dashboard");
  const tFeed = useTranslations("Feed");
  const locale = useLocale();
  const [posts, setPosts] = useState<MyPost[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/posts?mine=1")
      .then((res) => res.json())
      .then((body) => {
        if (active) setPosts(body.posts ?? []);
      });
    return () => {
      active = false;
    };
  }, []);

  async function deletePost(id: string) {
    setDeleting(id);
    const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
    setDeleting(null);
    if (res.ok) setPosts((prev) => prev?.filter((p) => p.id !== id) ?? null);
  }

  return (
    <div className={ui.card + " overflow-hidden mb-5"}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted px-6 pt-6">{t("yourPosts")}</p>

      {posts === null && <p className="text-sm text-muted p-6">{tFeed("loading")}</p>}
      {posts && posts.length === 0 && <p className="text-sm text-muted p-6">{t("noPosts")}</p>}

      <div className="divide-y divide-border">
        {posts?.map((post) => (
          <div key={post.id} className="p-6 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={ui.badge(post.kind === "looking_for" ? "secondary" : "accent")}>
                  {tFeed(post.kind === "looking_for" ? "kindLookingFor" : "kindOffering")}
                </span>
                {post.status === "closed" && <span className={ui.badge("secondary")}>{t("postClosed")}</span>}
                <span className="text-xs text-muted">{formatRelative(post.created_at, locale, tFeed("justNow"))}</span>
              </div>
              <p className="text-sm text-ink whitespace-pre-wrap">{post.caption}</p>
              <p className="text-xs text-muted mt-1">
                {tFeed("repliesCount", { count: post.replyCount })} · {post.likeCount} {tFeed("like")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => deletePost(post.id)}
              disabled={deleting === post.id}
              className="text-xs text-muted hover:text-danger transition shrink-0"
            >
              {t("deletePost")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
