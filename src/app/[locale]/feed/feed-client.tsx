"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { CardListSkeleton } from "@/components/skeletons";
import type { PostIdentityOption } from "@/lib/post-identities";
import { FEED_TARGET_EVENT, type FeedTargetDetail } from "@/lib/feed-target";
import type { Post, Reply } from "./feed-shared";
import PostCard from "./post-card";
import PostComposer from "./post-composer";
import PostReplies from "./post-replies";
import { getJson, request } from "@/lib/request";

export default function FeedClient({
  targetPostId = null,
  targetReplyId = null,
  adminMode = false,
}: {
  // /admin/feed: read-only apart from deleting any post or reply --
  // no composer, likes, replies or reports.
  adminMode?: boolean;
  // From a notification deep link (/feed?post=...&reply=...): that post is
  // loaded on its own, pinned to the top, with its thread open.
  targetPostId?: string | null;
  targetReplyId?: string | null;
}) {
  const t = useTranslations("Feed");

  const [posts, setPosts] = useState<Post[] | null>(null);
  // The first page failed to arrive (offline, dropped connection).
  const [loadFailed, setLoadFailed] = useState(false);
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
  const [selectedIdentity, setSelectedIdentity] = useState<{ profileId: string } | null>(null);
  const selectedIdentityOption = identities?.find((i) => i.profileId === selectedIdentity?.profileId) ?? null;

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
  const pendingScrollIdRef = useRef<string | null>(null);

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
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }

  useEffect(() => {
    let active = true;
    async function init() {
      const [postsBody, identitiesBody] = await Promise.all([
        getJson<{ posts?: Post[]; nextCursor?: string | null }>("/api/posts"),
        adminMode
          ? Promise.resolve({ identities: [], defaultIdentity: null })
          : getJson<{ identities?: PostIdentityOption[]; defaultIdentity?: { profileId: string } | null }>("/api/posts/identities"),
      ]);
      if (!active) return;
      if (!postsBody) {
        setLoadFailed(true);
        return;
      }
      const firstPage: Post[] = postsBody.posts ?? [];
      // A deep-linked post (effect below) may already have been pinned
      // before this first page arrived -- keep it on top, don't drop it.
      setPosts((prev) => {
        const pinned = prev ?? [];
        const pinnedIds = new Set(pinned.map((p) => p.id));
        return [...pinned, ...firstPage.filter((p) => !pinnedIds.has(p.id))];
      });
      setNextCursor(postsBody.nextCursor ?? null);
      setIdentities(identitiesBody?.identities ?? []);
      setSelectedIdentity(identitiesBody?.defaultIdentity ?? null);
    }
    init();
    return () => {
      active = false;
    };
  }, [adminMode]);

  // Bumped when the bell re-announces the target already in the URL (same
  // notification clicked again) -- the only case the props below can't see.
  const [reopenCount, setReopenCount] = useState(0);
  useEffect(() => {
    function onTarget(e: Event) {
      const { postId, replyId } = (e as CustomEvent<FeedTargetDetail>).detail;
      if (postId === targetPostId && replyId === targetReplyId) setReopenCount((c) => c + 1);
    }
    window.addEventListener(FEED_TARGET_EVENT, onTarget);
    return () => window.removeEventListener(FEED_TARGET_EVENT, onTarget);
  }, [targetPostId, targetReplyId]);

  // Notification deep links (/feed?post=...&reply=...). Keyed on the
  // target itself, not run once on mount: clicking a notification while
  // already on the feed only changes these props on the same mounted
  // component. Always refetches the post and its replies -- a new reply
  // is exactly why the notification exists, so a cached thread is stale.
  useEffect(() => {
    if (!targetPostId) return;
    const postId = targetPostId;
    let active = true;
    async function openTarget() {
      const [postRes, repliesRes] = await Promise.all([
        fetch(`/api/posts/${postId}`).catch(() => null),
        fetch(`/api/posts/${postId}/replies`).catch(() => null),
      ]);
      const target: Post | null = postRes?.ok ? ((await postRes.json()).post ?? null) : null;
      const threadReplies: Reply[] | null = repliesRes?.ok ? ((await repliesRes.json()).replies ?? []) : null;
      if (!active || !target) return;
      pendingScrollIdRef.current = targetReplyId ? `reply-${targetReplyId}` : `post-${postId}`;
      setPosts((prev) => [target, ...(prev ?? []).filter((p) => p.id !== target.id)]);
      if (threadReplies) setReplies((prev) => ({ ...prev, [postId]: threadReplies }));
      setOpenReplies(postId);
    }
    openTarget();
    return () => {
      active = false;
    };
  }, [targetPostId, targetReplyId, reopenCount]);

  async function submitPost() {
    setComposerError(null);
    if (!caption.trim() || identities === null) return;
    setPosting(true);
    const res = await request("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: caption.trim(), kind, postedAs: selectedIdentity }),
    });
    const body = (await res?.json().catch(() => ({}))) ?? {};
    setPosting(false);
    if (!res || !res.ok) {
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
    const res = await request(`/api/posts/${post.id}/like`, { method: "POST" });
    if (!res || !res.ok) {
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

  // Scroll a deep-linked post/reply into view once it has actually
  // rendered, then stop -- later updates to the thread shouldn't re-scroll.
  useEffect(() => {
    const id = pendingScrollIdRef.current;
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    pendingScrollIdRef.current = null;
  }, [posts, replies, openReplies]);

  function toggleReplies(postId: string) {
    const next = openReplies === postId ? null : postId;
    setOpenReplies(next);
    if (next && replies[next] === undefined) {
      setReplies((prev) => ({ ...prev, [next]: null }));
      getJson<{ replies?: Reply[] }>(`/api/posts/${next}/replies`).then((body) =>
        setReplies((prev) => {
          const updated = { ...prev };
          // On failure, forget the attempt so opening the thread again retries.
          if (body) updated[next] = body.replies ?? [];
          else delete updated[next];
          return updated;
        }),
      );
    }
  }

  async function submitReply(postId: string) {
    if (sendingReply[postId]) return; // a click and an Enter keydown can both fire for the same reply
    const body = (replyDraft[postId] ?? "").trim();
    if (!body) return;
    setSendingReply((prev) => ({ ...prev, [postId]: true }));
    setReplyError((prev) => ({ ...prev, [postId]: "" }));
    const parentReplyId = replyTarget[postId]?.id;
    const res = await request(`/api/posts/${postId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, parentReplyId }),
    });
    const data = (await res?.json().catch(() => ({}))) ?? {};
    setSendingReply((prev) => ({ ...prev, [postId]: false }));
    if (!res || !res.ok) {
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

  // Admins delete other people's content through the moderation routes;
  // their own (or anyone's own) goes through the author route as before.
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  async function deleteReply(postId: string, reply: Reply) {
    const replyId = reply.id;
    const url =
      adminMode && !reply.isMine ? `/api/admin/posts/${postId}/replies/${replyId}` : `/api/posts/${postId}/replies/${replyId}`;
    const res = await request(url, { method: "DELETE" });
    if (!res || !res.ok) return;
    const current = replies[postId] ?? [];
    const removed = collectDescendantIds(current, replyId);
    setReplies((prev) => ({ ...prev, [postId]: current.filter((r) => !removed.has(r.id)) }));
    // The delete cascades to whatever was nested under it too -- decrement
    // by everything actually removed, not just the one reply clicked.
    setPosts((prev) => prev?.map((p) => (p.id === postId ? { ...p, replyCount: Math.max(0, p.replyCount - removed.size) } : p)) ?? null);
  }

  async function deletePost(post: Post) {
    const url = adminMode && !post.isMine ? `/api/admin/posts/${post.id}` : `/api/posts/${post.id}`;
    const res = await request(url, { method: "DELETE" });
    setConfirmingDelete(null);
    if (!res || !res.ok) return;
    setPosts((prev) => prev?.filter((p) => p.id !== post.id) ?? null);
  }

  return (
    // Feed hugs the sidebar like X's timeline (its own content isn't
    // mx-auto'd) -- but on a screen much wider than that content, hugging
    // alone pins it to the true edge with a huge gap on the other side.
    // A wider, page-local box that IS centered in the true pane holds the
    // hugging content instead, matching X's "nav+timeline+phantom column"
    // group being centered as a unit, without affecting any other page.
    // In adminMode the admin page supplies the frame and header instead.
    <div className={adminMode ? "" : "max-w-4xl mx-auto px-4 py-8"}>
      <div className={`${adminMode ? "" : "max-w-2xl"} flex flex-col gap-6 ${posts === null && !adminMode ? "min-h-screen" : ""}`}>
        {!adminMode && (
          <div>
            <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-muted mt-1">{t("subtitle")}</p>
          </div>
        )}

        <div className={ui.card + ` overflow-hidden ${posts === null ? "flex flex-col flex-1" : ""}`}>
        {/* Composer — avatar + borderless input, X-style. Admins moderate
            the feed rather than post to it (/admin/feed). */}
        {!adminMode && (
          <PostComposer
            identities={identities}
            selectedProfileId={selectedIdentity?.profileId ?? null}
            onSelectIdentity={(profileId) => setSelectedIdentity({ profileId })}
            avatarUrl={selectedIdentityOption?.photoUrl ?? null}
            kind={kind}
            onKind={setKind}
            caption={caption}
            onCaption={setCaption}
            error={composerError}
            posting={posting}
            onSubmit={submitPost}
          />
        )}

        {posts === null && loadFailed && <p className="text-sm text-muted text-center py-10">{t("loadError")}</p>}
        {posts === null && !loadFailed && <CardListSkeleton label={t("loading")} />}
        {posts !== null && posts.length === 0 && <p className="text-sm text-muted text-center py-10">{t("empty")}</p>}

        <div className="divide-y divide-border">
          {posts?.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              adminMode={adminMode}
              profileOpen={openProfile === post.id}
              onToggleProfile={() => setOpenProfile((prev) => (prev === post.id ? null : post.id))}
              onDelete={() => deletePost(post)}
              confirmingDelete={confirmingDelete === post.id}
              onConfirmingDelete={(confirming) => setConfirmingDelete(confirming ? post.id : null)}
              onToggleReplies={() => toggleReplies(post.id)}
              onToggleLike={() => toggleLike(post)}
            >
              {openReplies === post.id && (
                <PostReplies
                  replies={replies[post.id] ?? null}
                  adminMode={adminMode}
                  collapsed={collapsedReplies}
                  onToggleCollapse={toggleCollapse}
                  highlightId={targetReplyId}
                  onDeleteReply={(r) => deleteReply(post.id, r)}
                  replyTarget={replyTarget[post.id] ?? null}
                  onReplyTarget={(target) => setReplyTarget((prev) => ({ ...prev, [post.id]: target }))}
                  draft={replyDraft[post.id] ?? ""}
                  onDraft={(value) => setReplyDraft((prev) => ({ ...prev, [post.id]: value }))}
                  sending={!!sendingReply[post.id]}
                  onSubmit={() => submitReply(post.id)}
                  error={replyError[post.id]}
                />
              )}
            </PostCard>
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
