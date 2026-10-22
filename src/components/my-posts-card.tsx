"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { getJson, request } from "@/lib/request";

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

/**
 * A user's own post history, with a real delete — not just "close" — on
 * /profile; with `kind`, only those (My Requests shows "Looking for").
 * `placeholder` adds a box on top for writing a new one of that kind
 * right here (My Requests), not only from the feed.
 */
export default function MyPostsCard({
  kind,
  title,
  empty,
  placeholder,
}: { kind?: MyPost["kind"]; title?: string; empty?: string; placeholder?: string } = {}) {
  const t = useTranslations("Dashboard");
  const tFeed = useTranslations("Feed");
  const locale = useLocale();
  const [posts, setPosts] = useState<MyPost[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  async function publish() {
    const caption = draft.trim();
    if (!caption || !kind || posting) return;
    setPosting(true);
    setPostError(null);
    const res = await request("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption, kind }),
    });
    setPosting(false);
    const body = await res?.json().catch(() => null);
    if (!res?.ok || !body?.post) {
      // The server explains a refusal it can name (contact details in
      // the text); anything else gets the generic message.
      setPostError(typeof body?.error === "string" ? body.error : tFeed("postError"));
      return;
    }
    setDraft("");
    setPosts((prev) => [{ ...body.post, status: "open" }, ...(prev ?? [])]);
  }

  useEffect(() => {
    let active = true;
    getJson("/api/posts?mine=1").then((body) => {
      if (active && body) setPosts(((body.posts ?? []) as MyPost[]).filter((p) => !kind || p.kind === kind));
    });
    return () => {
      active = false;
    };
  }, [kind]);

  async function deletePost(id: string) {
    setDeleting(id);
    const res = await request(`/api/posts/${id}`, { method: "DELETE" });
    setDeleting(null);
    if (res?.ok) setPosts((prev) => prev?.filter((p) => p.id !== id) ?? null);
  }

  return (
    <div className={ui.card + " overflow-hidden mb-5"}>
      {title !== "" && <p className="text-xs font-medium uppercase tracking-wide text-muted px-6 pt-6">{title ?? t("yourPosts")}</p>}

      {placeholder && kind && (
        <div className="flex flex-col gap-2 border-b border-border p-4">
          <textarea
            dir="auto"
            rows={3}
            maxLength={500}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className={ui.input + " resize-none text-[15px]"}
          />
          {postError && <p className="text-sm text-danger">{postError}</p>}
          <button type="button" onClick={publish} disabled={!draft.trim() || posting} className={ui.buttonPrimary + " self-end"}>
            {posting ? tFeed("posting") : tFeed("post")}
          </button>
        </div>
      )}

      {posts === null && <p className="text-sm text-muted p-6">{tFeed("loading")}</p>}
      {posts && posts.length === 0 && <p className="text-sm text-muted p-6">{empty ?? t("noPosts")}</p>}

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
              {/* Opens the post in the feed with its thread expanded -- the
                  same deep link a reply notification uses. */}
              <Link href={`/feed?post=${post.id}`} className="block group">
                <p dir="auto" className="text-sm text-ink whitespace-pre-wrap group-hover:underline underline-offset-2">{post.caption}</p>
                <p className="text-xs text-muted mt-1">
                  <span className="text-primary group-hover:underline underline-offset-2">
                    {tFeed("repliesCount", { count: post.replyCount })}
                  </span>{" "}
                  · {post.likeCount} {tFeed("like")}
                </p>
              </Link>
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
