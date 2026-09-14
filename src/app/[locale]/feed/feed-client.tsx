"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import ReportButton from "@/components/matches/report-button";
import ProfileSummaryPanel from "@/components/profile-summary-panel";
import { LogoLoader } from "@/components/animated-logo";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import { ChatIcon, HeartIcon } from "@/components/nav-icons";

type Post = {
  id: string;
  user_id: string;
  kind: "looking_for" | "offering";
  caption: string;
  created_at: string;
  author: { fullName: string; role: "parent" | "nanny"; profileId: string; photoUrl: string | null } | null;
  likeCount: number;
  likedByMe: boolean;
  replyCount: number;
  featured: boolean;
  isMine: boolean;
};

type Reply = { id: string; user_id: string; body: string; created_at: string; authorName: string | null; isMine: boolean };

function formatRelative(iso: string, locale: string, justNow: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (min < 60) return rtf.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (hr < 24) return rtf.format(-hr, "hour");
  return rtf.format(-Math.round(hr / 24), "day");
}

function Avatar({ photoUrl, size = 44, className = "" }: { photoUrl: string | null; size?: number; className?: string }) {
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

export default function FeedClient({ myRole }: { myRole: "parent" | "nanny" }) {
  const t = useTranslations("Feed");
  const locale = useLocale();

  const [posts, setPosts] = useState<Post[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  const [openProfile, setOpenProfile] = useState<string | null>(null);
  const [openReplies, setOpenReplies] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, Reply[] | null>>({});
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replyError, setReplyError] = useState<Record<string, string>>({});

  // "sent", or the server's actual error message so a rejection is
  // diagnosable instead of hidden behind one generic string.
  const [interestState, setInterestState] = useState<Record<string, string>>({});

  function loadPosts(before?: string) {
    const url = before ? `/api/posts?before=${encodeURIComponent(before)}` : "/api/posts";
    if (before) setLoadingMore(true);
    return fetch(url)
      .then((res) => res.json())
      .then((body) => {
        setPosts((prev) => (before ? [...(prev ?? []), ...(body.posts ?? [])] : (body.posts ?? [])));
        setNextCursor(body.nextCursor ?? null);
      })
      .finally(() => setLoadingMore(false));
  }

  useEffect(() => {
    let active = true;
    async function init() {
      const res = await fetch("/api/posts");
      const body = await res.json();
      if (!active) return;
      setPosts(body.posts ?? []);
      setNextCursor(body.nextCursor ?? null);
    }
    init();
    return () => {
      active = false;
    };
  }, []);

  async function submitPost() {
    setComposerError(null);
    if (!caption.trim()) return;
    setPosting(true);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: caption.trim() }),
    });
    const body = await res.json();
    setPosting(false);
    if (!res.ok) {
      setComposerError(typeof body.error === "string" ? body.error : t("postError"));
      return;
    }
    setPosts((prev) => [body.post as Post, ...(prev ?? [])]);
    setCaption("");
  }

  async function toggleLike(post: Post) {
    setPosts(
      (prev) =>
        prev?.map((p) =>
          p.id === post.id
            ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) }
            : p,
        ) ?? null,
    );
    const res = await fetch(`/api/posts/${post.id}/like`, { method: "POST" });
    if (!res.ok) {
      // revert on failure
      setPosts(
        (prev) =>
          prev?.map((p) =>
            p.id === post.id
              ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) }
              : p,
          ) ?? null,
      );
    }
  }

  function toggleReplies(postId: string) {
    const next = openReplies === postId ? null : postId;
    setOpenReplies(next);
    if (next && replies[next] === undefined) {
      setReplies((prev) => ({ ...prev, [next]: null }));
      fetch(`/api/posts/${next}/replies`)
        .then((res) => res.json())
        .then((body) => setReplies((prev) => ({ ...prev, [next]: body.replies ?? [] })));
    }
  }

  async function submitReply(postId: string) {
    const body = (replyDraft[postId] ?? "").trim();
    if (!body) return;
    setReplyError((prev) => ({ ...prev, [postId]: "" }));
    const res = await fetch(`/api/posts/${postId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await res.json();
    if (!res.ok) {
      setReplyError((prev) => ({ ...prev, [postId]: typeof data.error === "string" ? data.error : t("replyError") }));
      return;
    }
    setReplies((prev) => ({ ...prev, [postId]: [...(prev[postId] ?? []), data.reply as Reply] }));
    setReplyDraft((prev) => ({ ...prev, [postId]: "" }));
    setPosts((prev) => prev?.map((p) => (p.id === postId ? { ...p, replyCount: p.replyCount + 1 } : p)) ?? null);
  }

  async function expressInterest(postId: string) {
    const res = await fetch(`/api/posts/${postId}/interest`, { method: "POST" });
    if (res.ok) {
      setInterestState((prev) => ({ ...prev, [postId]: "sent" }));
      return;
    }
    const body = await res.json().catch(() => null);
    setInterestState((prev) => ({ ...prev, [postId]: typeof body?.error === "string" ? body.error : t("interestError") }));
  }

  async function closePost(postId: string) {
    await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    setPosts((prev) => prev?.filter((p) => p.id !== postId) ?? null);
  }

  return (
    // Feed hugs the sidebar like X's timeline (its own content isn't
    // mx-auto'd) -- but on a screen much wider than that content, hugging
    // alone pins it to the true edge with a huge gap on the other side.
    // A wider, page-local box that IS centered in the true pane holds the
    // hugging content instead, matching X's "nav+timeline+phantom column"
    // group being centered as a unit, without affecting any other page.
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className={`max-w-2xl flex flex-col gap-6 ${posts === null ? "min-h-screen" : ""}`}>
        <div>
          <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted mt-1">{t("subtitle")}</p>
        </div>

        <div className={ui.card + ` overflow-hidden ${posts === null ? "flex flex-col flex-1" : ""}`}>
        {/* Composer — avatar + borderless input, X-style */}
        <div className="flex gap-3 p-4 border-b border-border">
          <Avatar photoUrl={null} size={44} className="mt-0.5" />
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <textarea
              className="w-full resize-none border-none bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
              rows={2}
              maxLength={500}
              placeholder={myRole === "parent" ? t("captionPlaceholderParent") : t("captionPlaceholderNanny")}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            {composerError && <p className="text-sm text-danger">{composerError}</p>}
            <div className="flex justify-end">
              <button type="button" onClick={submitPost} disabled={posting || !caption.trim()} className={ui.buttonPrimary + " px-5! py-2!"}>
                {posting ? t("posting") : t("post")}
              </button>
            </div>
          </div>
        </div>

        {posts === null && <LogoLoader label={t("loading")} fullHeight />}
        {posts !== null && posts.length === 0 && <p className="text-sm text-muted text-center py-10">{t("empty")}</p>}

        <div className="divide-y divide-border">
          {posts?.map((post) => (
            <article key={post.id} className="flex gap-3 p-4">
              <Avatar photoUrl={post.author?.photoUrl ?? null} size={44} className="mt-0.5" />

              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 flex-wrap text-[15px]">
                  {post.author && post.author.role !== myRole ? (
                    <button
                      type="button"
                      onClick={() => setOpenProfile((prev) => (prev === post.id ? null : post.id))}
                      className="font-semibold text-ink hover:underline"
                    >
                      {post.author.fullName}
                    </button>
                  ) : (
                    <span className="font-semibold text-ink">{post.author?.fullName ?? t("someone")}</span>
                  )}
                  <span className={ui.badge(post.kind === "looking_for" ? "secondary" : "accent") + " py-0!"}>
                    {t(post.kind === "looking_for" ? "kindLookingFor" : "kindOffering")}
                  </span>
                  {post.featured && <span className={ui.badge("berry") + " py-0!"}>★ {t("featuredBadge")}</span>}
                  <span className="text-muted">·</span>
                  <span className="text-muted">{formatRelative(post.created_at, locale, t("justNow"))}</span>

                  <div className="ms-auto shrink-0">
                    {!post.isMine && <ReportButton postId={post.id} trigger="icon" />}
                    {post.isMine && (
                      <button
                        type="button"
                        onClick={() => closePost(post.id)}
                        className="text-xs text-muted hover:text-danger transition"
                      >
                        {t("closePost")}
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-[15px] text-ink whitespace-pre-wrap">{post.caption}</p>

                {openProfile === post.id && post.author && (
                  <ProfileSummaryPanel profileType={post.author.role} profileId={post.author.profileId} />
                )}

                <div className="flex items-center justify-between max-w-[280px] mt-2">
                  <button
                    type="button"
                    onClick={() => toggleReplies(post.id)}
                    className="flex items-center gap-2 text-muted hover:text-ink transition"
                  >
                    <ChatIcon className="h-[18px] w-[18px]" />
                    <span className="text-sm">{post.replyCount > 0 ? post.replyCount : ""}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLike(post)}
                    className={`flex items-center gap-2 transition ${post.likedByMe ? "text-primary" : "text-muted hover:text-primary"}`}
                  >
                    <HeartIcon className="h-[18px] w-[18px]" fill={post.likedByMe ? "currentColor" : "none"} />
                    <span className="text-sm">{post.likeCount > 0 ? post.likeCount : ""}</span>
                  </button>
                </div>

                {!post.isMine && post.author?.role !== myRole && (
                  <div>
                    <button
                      type="button"
                      onClick={() => expressInterest(post.id)}
                      disabled={interestState[post.id] === "sent"}
                      className={ui.buttonSecondary + " mt-1 px-4! py-1.5! text-xs"}
                    >
                      {interestState[post.id] === "sent" ? t("interestSent") : t("imInterested")}
                    </button>
                  </div>
                )}
                {interestState[post.id] && interestState[post.id] !== "sent" && (
                  <p className="text-xs text-danger">{interestState[post.id]}</p>
                )}

                {openReplies === post.id && (
                  <div className="mt-2 flex flex-col gap-3 border-t border-border pt-3">
                    {replies[post.id] === null && <p className="text-xs text-muted">{t("loading")}</p>}
                    {replies[post.id]?.map((r) => (
                      <div key={r.id} className="flex gap-2.5">
                        <Avatar photoUrl={null} size={28} />
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-ink">{r.isMine ? t("you") : (r.authorName ?? t("someone"))} </span>
                          <span className="text-sm text-ink/80">{r.body}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2 items-center">
                      <Avatar photoUrl={null} size={28} />
                      <input
                        type="text"
                        className={ui.input + " py-1.5!"}
                        placeholder={t("replyPlaceholder")}
                        maxLength={500}
                        value={replyDraft[post.id] ?? ""}
                        onChange={(e) => setReplyDraft((prev) => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && submitReply(post.id)}
                      />
                      <button type="button" onClick={() => submitReply(post.id)} className={ui.buttonSecondary + " px-4! py-1.5! text-xs shrink-0"}>
                        {t("send")}
                      </button>
                    </div>
                    {replyError[post.id] && <p className="text-xs text-danger">{replyError[post.id]}</p>}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      {nextCursor && (
        <button
          type="button"
          onClick={() => loadPosts(nextCursor)}
          disabled={loadingMore}
          className={ui.buttonGhost + " mx-auto"}
        >
          {loadingMore ? t("loading") : t("loadMore")}
        </button>
      )}
      </div>
    </div>
  );
}
