"use client";

import { useLocale, useTranslations } from "next-intl";
import { Avatar, formatRelative, type Reply } from "./feed-shared";

// Renders one level of the cascade, then recurses into each reply's own
// children -- matching X's "a reply is a full mini-post, and replying to
// a reply nests under it" shape, adapted to a page instead of X's
// click-into-a-new-page navigation.
export default function ReplyThread({
  allReplies,
  parentId,
  depth,
  onReplyClick,
  onDeleteClick,
  collapsed,
  onToggleCollapse,
  highlightId,
  adminMode = false,
}: {
  allReplies: Reply[];
  parentId: string | null;
  depth: number;
  onReplyClick: (reply: Reply) => void;
  onDeleteClick: (reply: Reply) => void;
  collapsed: Set<string>;
  onToggleCollapse: (replyId: string) => void;
  highlightId: string | null;
  adminMode?: boolean;
}) {
  const t = useTranslations("Feed");
  const locale = useLocale();
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
                  {!adminMode && (
                    <button type="button" onClick={() => onReplyClick(r)} className="text-xs text-muted hover:text-ink transition">
                      {t("reply")}
                    </button>
                  )}
                  {descendantCount > 0 && (
                    <button
                      type="button"
                      onClick={() => onToggleCollapse(r.id)}
                      className="text-xs text-primary hover:underline"
                    >
                      {isCollapsed ? t("showReplies", { count: descendantCount }) : t("hideReplies")}
                    </button>
                  )}
                  {(r.isMine || adminMode) && (
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
                onReplyClick={onReplyClick}
                onDeleteClick={onDeleteClick}
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                highlightId={highlightId}
                adminMode={adminMode}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
