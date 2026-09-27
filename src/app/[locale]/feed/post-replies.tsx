"use client";

import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { Avatar, type Reply } from "./feed-shared";
import ReplyThread from "./reply-thread";

/** A post's open reply section: the thread, and (outside admin) the reply box. */
export default function PostReplies({
  replies,
  adminMode,
  collapsed,
  onToggleCollapse,
  highlightId,
  onDeleteReply,
  replyTarget,
  onReplyTarget,
  draft,
  onDraft,
  sending,
  onSubmit,
  error,
}: {
  // null while loading
  replies: Reply[] | null;
  adminMode: boolean;
  collapsed: Set<string>;
  onToggleCollapse: (replyId: string) => void;
  highlightId: string | null;
  onDeleteReply: (reply: Reply) => void;
  replyTarget: { id: string; name: string } | null;
  onReplyTarget: (target: { id: string; name: string } | null) => void;
  draft: string;
  onDraft: (value: string) => void;
  sending: boolean;
  onSubmit: () => void;
  error: string | undefined;
}) {
  const t = useTranslations("Feed");

  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-border pt-3">
      {replies === null && <p className="text-xs text-muted">{t("loading")}</p>}
      {replies && (
        <ReplyThread
          allReplies={replies}
          parentId={null}
          depth={0}
          onReplyClick={(r) => onReplyTarget({ id: r.id, name: r.isMine ? t("you") : (r.authorName ?? t("someone")) })}
          onDeleteClick={onDeleteReply}
          adminMode={adminMode}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
          highlightId={highlightId}
        />
      )}

      {!adminMode && (
        <>
          {replyTarget && (
            <p className="text-xs text-muted">
              {t("replyingTo", { name: replyTarget.name })}{" "}
              <button
                type="button"
                onClick={() => onReplyTarget(null)}
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
          value={draft}
          disabled={sending}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={sending}
          className={ui.buttonSecondary + " px-4! py-1.5! text-xs shrink-0"}
        >
          {t("send")}
        </button>
      </div>
        </>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
