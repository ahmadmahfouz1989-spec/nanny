"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { DAYS } from "@/lib/validation/profile";
import ReportButton from "@/components/matches/report-button";
import ProfileSummaryPanel from "@/components/profile-summary-panel";

type Location = { id: string; name_en: string; name_ar: string; name_fr: string };

type Post = {
  id: string;
  user_id: string;
  kind: "looking_for" | "offering";
  days: string[];
  caption: string;
  created_at: string;
  locations: Location | null;
  author: { fullName: string; role: "parent" | "nanny"; profileId: string } | null;
  likeCount: number;
  likedByMe: boolean;
  replyCount: number;
  featured: boolean;
  isMine: boolean;
};

type Reply = { id: string; user_id: string; body: string; created_at: string; authorName: string | null; isMine: boolean };

function localizedName(l: Location, locale: string) {
  if (locale === "ar") return l.name_ar;
  if (locale === "fr") return l.name_fr;
  return l.name_en;
}

function formatRelative(iso: string, locale: string, justNow: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (min < 60) return rtf.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (hr < 24) return rtf.format(-hr, "hour");
  return rtf.format(-Math.round(hr / 24), "day");
}

export default function FeedClient({ myRole }: { myRole: "parent" | "nanny" }) {
  const t = useTranslations("Feed");
  const tDays = useTranslations("Days");
  const locale = useLocale();

  const [posts, setPosts] = useState<Post[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [governorates, setGovernorates] = useState<Location[]>([]);

  const [caption, setCaption] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  const [openProfile, setOpenProfile] = useState<string | null>(null);
  const [openReplies, setOpenReplies] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, Reply[] | null>>({});
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replyError, setReplyError] = useState<Record<string, string>>({});

  const [interestState, setInterestState] = useState<Record<string, "sent" | "error">>({});

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
      const [postsRes, locationsRes] = await Promise.all([fetch("/api/posts"), fetch("/api/locations?level=governorate")]);
      const [postsBody, locationsBody] = await Promise.all([postsRes.json(), locationsRes.json()]);
      if (!active) return;
      setPosts(postsBody.posts ?? []);
      setNextCursor(postsBody.nextCursor ?? null);
      setGovernorates((locationsBody.locations ?? []) as Location[]);
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
      body: JSON.stringify({ caption: caption.trim(), days, locationId }),
    });
    const body = await res.json();
    setPosting(false);
    if (!res.ok) {
      setComposerError(typeof body.error === "string" ? body.error : t("postError"));
      return;
    }
    setPosts((prev) => [body.post as Post, ...(prev ?? [])]);
    setCaption("");
    setDays([]);
    setLocationId(null);
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
    setInterestState((prev) => ({ ...prev, [postId]: res.ok ? "sent" : "error" }));
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
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted mt-1">{t("subtitle")}</p>
      </div>

      <div className={ui.card + " p-4 flex flex-col gap-3"}>
        <label className={ui.label}>{myRole === "parent" ? t("composerLabelParent") : t("composerLabelNanny")}</label>
        <textarea
          className={ui.input}
          rows={3}
          maxLength={500}
          placeholder={myRole === "parent" ? t("captionPlaceholderParent") : t("captionPlaceholderNanny")}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <button
              type="button"
              key={day}
              onClick={() => setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))}
              className={ui.pill(days.includes(day))}
            >
              {tDays(day)}
            </button>
          ))}
        </div>
        <select className={ui.select} value={locationId ?? ""} onChange={(e) => setLocationId(e.target.value || null)}>
          <option value="">{t("anyGovernorate")}</option>
          {governorates.map((g) => (
            <option key={g.id} value={g.id}>
              {localizedName(g, locale)}
            </option>
          ))}
        </select>
        {composerError && <p className="text-sm text-danger">{composerError}</p>}
        <div className="flex justify-end">
          <button type="button" onClick={submitPost} disabled={posting || !caption.trim()} className={ui.buttonPrimary}>
            {posting ? t("posting") : t("post")}
          </button>
        </div>
      </div>

      {posts === null && <p className="text-sm text-muted text-center py-8">{t("loading")}</p>}
      {posts !== null && posts.length === 0 && <p className="text-sm text-muted text-center py-8">{t("empty")}</p>}

      <div className="flex flex-col gap-4">
        {posts?.map((post) => (
          <div key={post.id} className={ui.card + " p-4 flex flex-col gap-3"}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={ui.badge(post.kind === "looking_for" ? "secondary" : "accent")}>
                  {t(post.kind === "looking_for" ? "kindLookingFor" : "kindOffering")}
                </span>
                {post.featured && <span className={ui.badge("berry")}>★ {t("featuredBadge")}</span>}
                {post.author && post.author.role !== myRole ? (
                  <button
                    type="button"
                    onClick={() => setOpenProfile((prev) => (prev === post.id ? null : post.id))}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {post.author.fullName}
                  </button>
                ) : (
                  <span className="text-sm font-medium text-ink">{post.author?.fullName ?? t("someone")}</span>
                )}
              </div>
              <span className="text-xs text-muted shrink-0">{formatRelative(post.created_at, locale, t("justNow"))}</span>
            </div>

            <p className="text-sm text-ink whitespace-pre-wrap">{post.caption}</p>

            {(post.locations || post.days.length > 0) && (
              <div className="flex flex-wrap gap-2 text-xs text-muted">
                {post.locations && <span className={ui.badge("secondary")}>{localizedName(post.locations, locale)}</span>}
                {post.days.map((d) => (
                  <span key={d} className={ui.badge("secondary")}>
                    {tDays(d)}
                  </span>
                ))}
              </div>
            )}

            {openProfile === post.id && post.author && (
              <ProfileSummaryPanel profileType={post.author.role} profileId={post.author.profileId} />
            )}

            <div className="flex items-center gap-4 pt-1 border-t border-border">
              <button
                type="button"
                onClick={() => toggleLike(post)}
                className={`flex items-center gap-1.5 text-sm transition ${post.likedByMe ? "text-primary font-semibold" : "text-muted hover:text-ink"}`}
              >
                <span aria-hidden>{post.likedByMe ? "♥" : "♡"}</span>
                {post.likeCount > 0 ? post.likeCount : t("like")}
              </button>
              <button type="button" onClick={() => toggleReplies(post.id)} className="text-sm text-muted hover:text-ink transition">
                {post.replyCount > 0 ? t("repliesCount", { count: post.replyCount }) : t("reply")}
              </button>

              {!post.isMine && post.author?.role !== myRole && (
                <button
                  type="button"
                  onClick={() => expressInterest(post.id)}
                  disabled={interestState[post.id] === "sent"}
                  className={ui.buttonSecondary + " ms-auto px-3! py-1! text-xs"}
                >
                  {interestState[post.id] === "sent" ? t("interestSent") : t("imInterested")}
                </button>
              )}
              {post.isMine && (
                <button type="button" onClick={() => closePost(post.id)} className="ms-auto text-xs text-muted hover:text-danger transition">
                  {t("closePost")}
                </button>
              )}
            </div>
            {interestState[post.id] === "error" && <p className="text-xs text-danger">{t("interestError")}</p>}

            {!post.isMine && <ReportButton postId={post.id} />}

            {openReplies === post.id && (
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                {replies[post.id] === null && <p className="text-xs text-muted">{t("loading")}</p>}
                {replies[post.id]?.map((r) => (
                  <div key={r.id} className="text-sm">
                    <span className="font-medium text-ink">{r.isMine ? t("you") : (r.authorName ?? t("someone"))}: </span>
                    <span className="text-ink/80">{r.body}</span>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    className={ui.input}
                    placeholder={t("replyPlaceholder")}
                    maxLength={500}
                    value={replyDraft[post.id] ?? ""}
                    onChange={(e) => setReplyDraft((prev) => ({ ...prev, [post.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && submitReply(post.id)}
                  />
                  <button type="button" onClick={() => submitReply(post.id)} className={ui.buttonSecondary + " px-4! py-1.5! text-xs"}>
                    {t("send")}
                  </button>
                </div>
                {replyError[post.id] && <p className="text-xs text-danger">{replyError[post.id]}</p>}
              </div>
            )}
          </div>
        ))}
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
  );
}
