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
import type { PostIdentityOption, PostIdentityType } from "@/lib/post-identities";

type Post = {
  id: string;
  user_id: string;
  kind: "looking_for" | "offering";
  caption: string;
  created_at: string;
  author: { fullName: string; role?: "parent" | "nanny" | "generic"; profileId: string | null; photoUrl: string | null } | null;
  likeCount: number;
  likedByMe: boolean;
  replyCount: number;
  featured: boolean;
  isMine: boolean;
};

type Reply = {
  id: string;
  user_id: string;
  body: string;
  parent_reply_id: string | null;
  created_at: string;
  authorName: string | null;
  authorPhotoUrl: string | null;
  isMine: boolean;
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

// Renders one level of the cascade, then recurses into each reply's own
// children -- matching X's "a reply is a full mini-post, and replying to
// a reply nests under it" shape, adapted to a page instead of X's
// click-into-a-new-page navigation.
function ReplyThread({
  allReplies,
  parentId,
  depth,
  t,
  locale,
  onReplyClick,
  onDeleteClick,
  collapsed,
  onToggleCollapse,
  highlightId,
}: {
  allReplies: Reply[];
  parentId: string | null;
  depth: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
  locale: string;
  onReplyClick: (reply: Reply) => void;
  onDeleteClick: (reply: Reply) => void;
  collapsed: Set<string>;
  onToggleCollapse: (replyId: string) => void;
  highlightId: string | null;
}) {
  const children = allReplies.filter((r) => r.parent_reply_id === parentId);
  if (children.length === 0) return null;

  return (
    <div className={depth > 0 ? "flex flex-col gap-3 mt-3 ps-4 border-s border-border" : "flex flex-col gap-3"}>
      {children.map((r) => {
        const descendantCount = allReplies.filter((x) => x.parent_reply_id === r.id).length;
        const isCollapsed = collapsed.has(r.id);
        return (
          <div key={r.id} id={`reply-${r.id}`}>
            <div className={`flex gap-2.5 rounded-lg transition-colors ${highlightId === r.id ? "bg-primary-soft -mx-1.5 px-1.5 py-1" : ""}`}>
              <Avatar photoUrl={r.authorPhotoUrl} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-ink">{r.isMine ? t("you") : (r.authorName ?? t("someone"))}</span>
                  <span className="text-xs text-muted">{formatRelative(r.created_at, locale, t("justNow"))}</span>
                </div>
                <p dir="auto" className="text-sm text-ink/90 whitespace-pre-wrap">{r.body}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <button type="button" onClick={() => onReplyClick(r)} className="text-xs text-muted hover:text-ink transition">
                    {t("reply")}
                  </button>
                  {descendantCount > 0 && (
                    <button
                      type="button"
                      onClick={() => onToggleCollapse(r.id)}
                      className="text-xs text-primary hover:underline"
                    >
                      {isCollapsed ? t("showReplies", { count: descendantCount }) : t("hideReplies")}
                    </button>
                  )}
                  {r.isMine && (
                    <button type="button" onClick={() => onDeleteClick(r)} className="text-xs text-muted hover:text-danger transition">
                      {t("deleteReply")}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {!isCollapsed && (
              <ReplyThread
                allReplies={allReplies}
                parentId={r.id}
                depth={depth + 1}
                t={t}
                locale={locale}
                onReplyClick={onReplyClick}
                onDeleteClick={onDeleteClick}
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                highlightId={highlightId}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function FeedClient({
  targetPostId = null,
  targetReplyId = null,
}: {
  // From a notification deep link (/feed?post=...&reply=...): that post is
  // loaded on its own, pinned to the top, with its thread open.
  targetPostId?: string | null;
  targetReplyId?: string | null;
}) {
  const t = useTranslations("Feed");
  const tNav = useTranslations("Nav");
  const tSaved = useTranslations("SavedProfiles");
  const locale = useLocale();

  function identityLabel(identity: PostIdentityOption) {
    if (identity.type === "generic") {
      const categoryName = locale === "ar" ? identity.categoryNameAr : identity.categoryNameEn;
      const roleLabel = identity.genericRole === "provider" ? tSaved("roleOffering") : tSaved("roleSeeking");
      return `${categoryName} · ${roleLabel} — ${identity.fullName}`;
    }
    return `${tNav("nanny")} — ${identity.fullName}`;
  }

  const [posts, setPosts] = useState<Post[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [caption, setCaption] = useState("");
  const [kind, setKind] = useState<"looking_for" | "offering">("looking_for");
  const [posting, setPosting] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  // null = still loading -- the Post button stays disabled meanwhile, or a
  // fast submit could go out with no chosen identity even for an account
  // that has more than one.
  const [identities, setIdentities] = useState<PostIdentityOption[] | null>(null);
  const [selectedIdentity, setSelectedIdentity] = useState<{ type: PostIdentityType; profileId: string } | null>(null);
  const selectedIdentityOption =
    identities?.find((i) => selectedIdentity && i.type === selectedIdentity.type && i.profileId === selectedIdentity.profileId) ?? null;

  const [openProfile, setOpenProfile] = useState<string | null>(null);
  const [openReplies, setOpenReplies] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, Reply[] | null>>({});
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replyError, setReplyError] = useState<Record<string, string>>({});
  // Which specific reply (if any) the next reply in a post's thread is
  // aimed at -- the cascade: replying to a reply nests under it, not the
  // post itself.
  const [replyTarget, setReplyTarget] = useState<Record<string, { id: string; name: string } | null>>({});
  // Reply ids whose own sub-replies are currently hidden -- reply ids are
  // unique across every post, so one flat set works fine here.
  const [collapsedReplies, setCollapsedReplies] = useState<Set<string>>(new Set());

  function toggleCollapse(replyId: string) {
    setCollapsedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(replyId)) next.delete(replyId);
      else next.add(replyId);
      return next;
    });
  }

  const [sendingReply, setSendingReply] = useState<Record<string, boolean>>({});

  function loadPosts(before?: string) {
    const url = before ? `/api/posts?before=${encodeURIComponent(before)}` : "/api/posts";
    if (before) setLoadingMore(true);
    return fetch(url)
      .then((res) => res.json())
      .then((body) => {
        setPosts((prev) => {
          if (!before) return body.posts ?? [];
          // A deep-linked post is pinned at the top already -- don't list
          // it a second time when its own page comes around.
          const known = new Set((prev ?? []).map((p) => p.id));
          return [...(prev ?? []), ...((body.posts ?? []) as Post[]).filter((p) => !known.has(p.id))];
        });
        setNextCursor(body.nextCursor ?? null);
      })
      .finally(() => setLoadingMore(false));
  }

  useEffect(() => {
    let active = true;
    async function init() {
      const [postsRes, identitiesRes, targetRes] = await Promise.all([
        fetch("/api/posts"),
        fetch("/api/posts/identities"),
        targetPostId ? fetch(`/api/posts/${targetPostId}`).catch(() => null) : Promise.resolve(null),
      ]);
      const [postsBody, identitiesBody] = await Promise.all([postsRes.json(), identitiesRes.json()]);
      const target: Post | null = targetRes?.ok ? ((await targetRes.json()).post ?? null) : null;
      if (!active) return;
      const firstPage: Post[] = postsBody.posts ?? [];
      setPosts(target ? [target, ...firstPage.filter((p) => p.id !== target.id)] : firstPage);
      if (target) toggleReplies(target.id);
      setNextCursor(postsBody.nextCursor ?? null);
      setIdentities(identitiesBody.identities ?? []);
      setSelectedIdentity(identitiesBody.defaultIdentity ?? null);
    }
    init();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitPost() {
    setComposerError(null);
    if (!caption.trim() || identities === null) return;
    setPosting(true);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: caption.trim(), kind, postedAs: selectedIdentity }),
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

  // Once a deep-linked reply is actually on screen, bring it into view.
  const targetReplies = targetPostId ? replies[targetPostId] : undefined;
  useEffect(() => {
    if (!targetReplyId || !targetReplies) return;
    document.getElementById(`reply-${targetReplyId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [targetReplyId, targetReplies]);

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
    if (sendingReply[postId]) return; // a click and an Enter keydown can both fire for the same reply
    const body = (replyDraft[postId] ?? "").trim();
    if (!body) return;
    setSendingReply((prev) => ({ ...prev, [postId]: true }));
    setReplyError((prev) => ({ ...prev, [postId]: "" }));
    const parentReplyId = replyTarget[postId]?.id;
    const res = await fetch(`/api/posts/${postId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, parentReplyId }),
    });
    const data = await res.json();
    setSendingReply((prev) => ({ ...prev, [postId]: false }));
    if (!res.ok) {
      setReplyError((prev) => ({ ...prev, [postId]: typeof data.error === "string" ? data.error : t("replyError") }));
      return;
    }
    const reply = { ...data.reply, parent_reply_id: parentReplyId ?? null } as Reply;
    setReplies((prev) => ({ ...prev, [postId]: [...(prev[postId] ?? []), reply] }));
    setReplyDraft((prev) => ({ ...prev, [postId]: "" }));
    setReplyTarget((prev) => ({ ...prev, [postId]: null }));
    setPosts((prev) => prev?.map((p) => (p.id === postId ? { ...p, replyCount: p.replyCount + 1 } : p)) ?? null);
  }

  // Removing a reply also removes whatever was nested under it, client-side
  // mirroring the database's own on-delete-cascade for parent_reply_id.
  function collectDescendantIds(allReplies: Reply[], rootId: string): Set<string> {
    const ids = new Set([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of allReplies) {
        if (r.parent_reply_id && ids.has(r.parent_reply_id) && !ids.has(r.id)) {
          ids.add(r.id);
          grew = true;
        }
      }
    }
    return ids;
  }

  async function deleteReply(postId: string, replyId: string) {
    const res = await fetch(`/api/posts/${postId}/replies/${replyId}`, { method: "DELETE" });
    if (!res.ok) return;
    const current = replies[postId] ?? [];
    const removed = collectDescendantIds(current, replyId);
    setReplies((prev) => ({ ...prev, [postId]: current.filter((r) => !removed.has(r.id)) }));
    // The delete cascades to whatever was nested under it too -- decrement
    // by everything actually removed, not just the one reply clicked.
    setPosts((prev) => prev?.map((p) => (p.id === postId ? { ...p, replyCount: Math.max(0, p.replyCount - removed.size) } : p)) ?? null);
  }

  async function deletePost(postId: string) {
    await fetch(`/api/posts/${postId}`, { method: "DELETE" });
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
          <Avatar photoUrl={selectedIdentityOption?.photoUrl ?? null} size={44} className="mt-0.5" />
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {identities && identities.length > 1 && (
              <select
                className={ui.select + " w-auto text-xs py-1.5"}
                value={selectedIdentity ? `${selectedIdentity.type}:${selectedIdentity.profileId}` : ""}
                onChange={(e) => {
                  const [type, profileId] = e.target.value.split(":");
                  setSelectedIdentity({ type: type as PostIdentityType, profileId: profileId! });
                }}
              >
                {identities.map((identity) => (
                  <option key={`${identity.type}:${identity.profileId}`} value={`${identity.type}:${identity.profileId}`}>
                    {identityLabel(identity)}
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setKind("looking_for")} className={ui.pill(kind === "looking_for")}>
                {t("kindLookingFor")}
              </button>
              <button type="button" onClick={() => setKind("offering")} className={ui.pill(kind === "offering")}>
                {t("kindOffering")}
              </button>
            </div>
            <textarea
              dir="auto"
              className="w-full resize-none border-none bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
              rows={2}
              maxLength={500}
              placeholder={t("captionPlaceholder")}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            {composerError && <p className="text-sm text-danger">{composerError}</p>}
            <div className="flex justify-end">
              <button type="button" onClick={submitPost} disabled={posting || !caption.trim() || identities === null} className={ui.buttonPrimary + " px-5! py-2!"}>
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
                  {post.author?.role && post.author.profileId ? (
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
                        onClick={() => deletePost(post.id)}
                        className="text-xs text-muted hover:text-danger transition"
                      >
                        {t("deletePost")}
                      </button>
                    )}
                  </div>
                </div>

                <p dir="auto" className="text-[15px] text-ink whitespace-pre-wrap">{post.caption}</p>

                {openProfile === post.id && post.author?.role && post.author.profileId && (
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

                {openReplies === post.id && (
                  <div className="mt-2 flex flex-col gap-3 border-t border-border pt-3">
                    {replies[post.id] === null && <p className="text-xs text-muted">{t("loading")}</p>}
                    {replies[post.id] && (
                      <ReplyThread
                        allReplies={replies[post.id]!}
                        parentId={null}
                        depth={0}
                        t={t}
                        locale={locale}
                        onReplyClick={(r) => setReplyTarget((prev) => ({ ...prev, [post.id]: { id: r.id, name: r.isMine ? t("you") : (r.authorName ?? t("someone")) } }))}
                        onDeleteClick={(r) => deleteReply(post.id, r.id)}
                        collapsed={collapsedReplies}
                        onToggleCollapse={toggleCollapse}
                        highlightId={targetReplyId}
                      />
                    )}

                    {replyTarget[post.id] && (
                      <p className="text-xs text-muted">
                        {t("replyingTo", { name: replyTarget[post.id]!.name })}{" "}
                        <button
                          type="button"
                          onClick={() => setReplyTarget((prev) => ({ ...prev, [post.id]: null }))}
                          className="text-primary hover:underline"
                        >
                          {t("cancelReplyTarget")}
                        </button>
                      </p>
                    )}
                    <div className="flex gap-2 items-center">
                      <Avatar photoUrl={null} size={28} />
                      <input
                        type="text"
                        dir="auto"
                        className={ui.input + " py-1.5!"}
                        placeholder={t("replyPlaceholder")}
                        maxLength={500}
                        value={replyDraft[post.id] ?? ""}
                        disabled={!!sendingReply[post.id]}
                        onChange={(e) => setReplyDraft((prev) => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && submitReply(post.id)}
                      />
                      <button
                        type="button"
                        onClick={() => submitReply(post.id)}
                        disabled={!!sendingReply[post.id]}
                        className={ui.buttonSecondary + " px-4! py-1.5! text-xs shrink-0"}
                      >
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
