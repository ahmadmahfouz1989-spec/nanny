"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import ReportButton from "@/components/matches/report-button";
import { Link } from "@/i18n/navigation";
import { ChatIcon, HeartIcon } from "@/components/nav-icons";
import { ui } from "@/lib/ui";
import Image from "next/image";
import { Avatar, formatRelative, type Post } from "./feed-shared";
import type { PostWork } from "@/lib/posts";
import VerifiedCheck from "@/components/verified-check";

/** One post in the feed; its open reply section is passed in as children. */
export default function PostCard({
  post,
  adminMode,
  onDelete,
  confirmingDelete,
  onConfirmingDelete,
  onToggleReplies,
  onToggleLike,
  children,
}: {
  post: Post;
  adminMode: boolean;
  onDelete: () => void;
  // Admin deletes are two-step.
  confirmingDelete: boolean;
  onConfirmingDelete: (confirming: boolean) => void;
  onToggleReplies: () => void;
  onToggleLike: () => void;
  children?: React.ReactNode;
}) {
  const t = useTranslations("Feed");
  const tAdmin = useTranslations("Admin");
  // Bumped on each like: the heart remounts and pops.
  const [likePop, setLikePop] = useState(0);
  const locale = useLocale();

  return (
    <article id={`post-${post.id}`} className="flex gap-3 p-4 scroll-mt-6">
      {post.author?.profileId ? (
        <Link href={`/u/${post.author.profileId}`} aria-label={post.author.fullName} className="shrink-0 self-start">
          <Avatar photoUrl={post.author.photoUrl} name={post.author.fullName} size={44} className="mt-0.5" />
        </Link>
      ) : (
        <Avatar photoUrl={post.author?.photoUrl ?? null} name={post.author?.fullName} size={44} className="mt-0.5" />
      )}

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 flex-wrap text-[15px]">
          {post.author?.profileId ? (
            <Link href={`/u/${post.author.profileId}`} className="inline-flex items-center gap-1 font-semibold text-ink hover:underline">
              {post.author.fullName}
              {post.featured && <VerifiedCheck label={t("featuredBadge")} />}
            </Link>
          ) : (
            <span className="font-semibold text-ink">{post.author?.fullName ?? t("someone")}</span>
          )}
          <span className={ui.badge(post.kind === "looking_for" ? "secondary" : "accent") + " py-0!"}>
            {t(post.kind === "looking_for" ? "kindLookingFor" : "kindOffering")}
          </span>
          <span className="text-muted">·</span>
          <span className="text-muted">{formatRelative(post.created_at, locale, t("justNow"))}</span>

          <div className="ms-auto shrink-0">
            {!post.isMine && !adminMode && <ReportButton postId={post.id} trigger="icon" />}
            {post.isMine && !adminMode && (
              <button
                type="button"
                onClick={onDelete}
                className="text-xs text-muted hover:text-danger transition"
              >
                {t("deletePost")}
              </button>
            )}
            {/* Two-step, same as deleting a user on /admin/users --
                this removes someone else's post and its replies. */}
            {adminMode &&
              (confirmingDelete ? (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onDelete}
                    className="text-xs font-semibold text-danger hover:underline"
                  >
                    {tAdmin("confirmDelete")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onConfirmingDelete(false)}
                    className="text-xs text-muted hover:text-ink"
                  >
                    {t("cancelReplyTarget")}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onConfirmingDelete(true)}
                  className="text-xs text-muted hover:text-danger transition"
                >
                  {tAdmin("delete")}
                </button>
              ))}
          </div>
        </div>

        <p dir="auto" className="text-[15px] text-ink whitespace-pre-wrap">{post.caption}</p>

        {(post.photo_urls?.length ?? 0) > 0 && <PostPhotos urls={post.photo_urls!} label={t("photoOpen")} closeLabel={t("photoClose")} />}

        {post.work && <WorkPhotos work={post.work} label={t("workPhotosLabel", { title: post.work.title })} />}

        <div className="flex items-center justify-between max-w-[280px] mt-2">
          <button
            type="button"
            onClick={onToggleReplies}
            className="flex items-center gap-2 text-muted hover:text-ink transition"
          >
            <ChatIcon className="h-[18px] w-[18px]" />
            <span className="text-sm">{post.replyCount > 0 ? post.replyCount : ""}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!post.likedByMe) setLikePop((n) => n + 1);
              onToggleLike();
            }}
            disabled={adminMode}
            className={`flex items-center gap-2 transition ${post.likedByMe ? "text-primary" : "text-muted hover:text-primary"} disabled:hover:text-muted`}
          >
            <HeartIcon key={likePop} className={`h-[18px] w-[18px] ${likePop && post.likedByMe ? "pop" : ""}`} fill={post.likedByMe ? "currentColor" : "none"} />
            <span className="text-sm">{post.likeCount > 0 ? post.likeCount : ""}</span>
          </button>
        </div>

        {children}
      </div>
    </article>
  );
}

/**
 * A shared work project's photos, X-style: one wide, or a grid of up to
 * four, with "+N" on the last when there are more. Opens the work on the
 * profile.
 */
function WorkPhotos({ work, label }: { work: PostWork; label: string }) {
  const photos = work.photos;
  const more = work.photoCount - photos.length;
  return (
    <Link
      href={`/u/${work.profileId}#work`}
      aria-label={label}
      className={`mt-2 grid gap-0.5 overflow-hidden rounded-2xl border border-border ${photos.length > 1 ? "grid-cols-2" : ""}`}
    >
      {photos.map((photo, i) => (
        <span
          key={i}
          className={`relative block bg-surface-sunken ${
            photos.length === 1 ? "aspect-[16/10]" : photos.length === 3 && i === 0 ? "row-span-2 aspect-auto" : "aspect-square"
          }`}
        >
          <Image src={photo.url} alt="" fill unoptimized sizes="(max-width: 640px) 50vw, 300px" className="object-cover" />
          {more > 0 && i === photos.length - 1 && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-lg font-semibold text-white">+{more}</span>
          )}
        </span>
      ))}
    </Link>
  );
}

/**
 * The photos added to a post: one wide, or a grid of up to four. Tapping
 * one shows it full screen (tap anywhere or press Escape to close; arrows
 * or the keyboard go through the others).
 */
function PostPhotos({ urls, label, closeLabel }: { urls: string[]; label: string; closeLabel: string }) {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % urls.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + urls.length) % urls.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, urls.length]);

  return (
    <>
      <div className={`mt-2 grid gap-0.5 overflow-hidden rounded-2xl border border-border ${urls.length > 1 ? "grid-cols-2" : ""}`}>
        {urls.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={label}
            className={`relative block bg-surface-sunken ${
              urls.length === 1 ? "aspect-[4/3]" : urls.length === 3 && i === 0 ? "row-span-2 aspect-auto" : "aspect-square"
            }`}
          >
            <Image src={url} alt="" fill unoptimized sizes="(max-width: 640px) 50vw, 300px" className="object-cover" />
          </button>
        ))}
      </div>
      {open !== null && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[open]} alt="" className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            onClick={() => setOpen(null)}
            aria-label={closeLabel}
            className="absolute end-4 top-[calc(1rem+env(safe-area-inset-top))] grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
          {urls.length > 1 && (
            <span className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] rounded-full bg-white/15 px-3 py-1 text-sm text-white tabular-nums">
              {open + 1} / {urls.length}
            </span>
          )}
        </div>
      )}
    </>
  );
}
