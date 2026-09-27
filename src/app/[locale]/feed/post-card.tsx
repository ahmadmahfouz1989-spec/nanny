"use client";

import { useLocale, useTranslations } from "next-intl";
import ReportButton from "@/components/matches/report-button";
import ProfileSummaryPanel from "@/components/profile-summary-panel";
import { ChatIcon, HeartIcon } from "@/components/nav-icons";
import { ui } from "@/lib/ui";
import { Avatar, formatRelative, type Post } from "./feed-shared";

/** One post in the feed; its open reply section is passed in as children. */
export default function PostCard({
  post,
  adminMode,
  profileOpen,
  onToggleProfile,
  onDelete,
  confirmingDelete,
  onConfirmingDelete,
  onToggleReplies,
  onToggleLike,
  children,
}: {
  post: Post;
  adminMode: boolean;
  profileOpen: boolean;
  onToggleProfile: () => void;
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
  const locale = useLocale();

  return (
    <article id={`post-${post.id}`} className="flex gap-3 p-4 scroll-mt-6">
      <Avatar photoUrl={post.author?.photoUrl ?? null} size={44} className="mt-0.5" />

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 flex-wrap text-[15px]">
          {post.author?.profileId ? (
            <button
              type="button"
              onClick={onToggleProfile}
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

        {profileOpen && post.author?.profileId && (
          <ProfileSummaryPanel profileId={post.author.profileId} />
        )}

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
            onClick={onToggleLike}
            disabled={adminMode}
            className={`flex items-center gap-2 transition ${post.likedByMe ? "text-primary" : "text-muted hover:text-primary"} disabled:hover:text-muted`}
          >
            <HeartIcon className="h-[18px] w-[18px]" fill={post.likedByMe ? "currentColor" : "none"} />
            <span className="text-sm">{post.likeCount > 0 ? post.likeCount : ""}</span>
          </button>
        </div>

        {children}
      </div>
    </article>
  );
}
