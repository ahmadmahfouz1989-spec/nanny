"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { canOptimize } from "@/lib/image-src";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import ChatThread from "@/components/matches/chat-thread";
import { useChatViewport } from "@/components/matches/use-chat-viewport";
import ConversationHeader from "@/components/matches/conversation-header";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import ConnectIllustration from "@/components/illustrations/connect-illustration";
import { SearchIcon } from "@/components/nav-icons";
import { ui } from "@/lib/ui";
import { Link } from "@/i18n/navigation";
import { RowListSkeleton } from "@/components/skeletons";
import { getJson } from "@/lib/request";
import { announceUnreadChanged } from "@/lib/unread-events";
import { VOICE_NOTE_PLACEHOLDER_BODY } from "@/lib/voice-notes";
import { CHAT_PHOTO_PLACEHOLDER_BODY } from "@/lib/chat-photos";
import { callOutcome, type CallEntry } from "@/lib/call-history";
import CallLog, { CallArrow } from "@/components/calls/call-log";

const TONES = ["primary", "secondary", "berry"] as const;
const INBOX_POLL_MS = 6000;

type Conversation = {
  matchId: string;
  categorySlug: string;
  counterpart: { id: string; name: string; photoUrl: string | null };
  about: string | null;
  lastMessage: { body: string; createdAt: string } | null;
  lastCall: CallEntry | null;
  unreadCount: number;
};

/** When a conversation last had a message or a call. */
function lastActivity(c: Conversation) {
  const message = c.lastMessage?.createdAt ?? "";
  const call = c.lastCall?.createdAt ?? "";
  return call > message ? call : message;
}

type ThreadMessage = { id: string; sender_id: string; body: string; created_at: string };

function relativeTime(iso: string, locale: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (diffMin < 60) return rtf.format(-diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return rtf.format(-diffHour, "hour");
  const diffDay = Math.round(diffHour / 24);
  return rtf.format(-diffDay, "day");
}

export default function MessagesClient() {
  const t = useTranslations("Inbox");
  const tNav = useTranslations("Nav");
  const tPush = useTranslations("Push");
  const tCalls = useTranslations("Calls");
  // A voice note or a photo, in the reader's language.
  const previewText = (body: string) =>
    body === VOICE_NOTE_PLACEHOLDER_BODY ? tPush("voiceMessage") : body === CHAT_PHOTO_PLACEHOLDER_BODY ? tPush("photoMessage") : body;
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  // The open chat lives in the address (?match=), so the phone's Back
  // closes it instead of leaving Messages, and a reload keeps it open.
  const selected = searchParams.get("match");
  // Chats or Calls, also in the address (a missed-call notification opens Calls).
  const tab = searchParams.get("tab") === "calls" ? "calls" : "chats";
  const [missedCalls, setMissedCalls] = useState(0);
  // Whether this screen added the history step for the open chat (then
  // closing it goes back; otherwise it just drops ?match=).
  const pushedChat = useRef(false);
  const [query, setQuery] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  // A ref, not the `selected` state directly, so the polling interval
  // (set up once) always reads the current selection instead of whatever
  // it was when the interval was created.
  const selectedRef = useRef(selected);
  const unreadTotal = useRef<number | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
    // Closed some other way (the phone's Back): nothing of ours to go back over.
    if (!selected) pushedChat.current = false;
  }, [selected]);

  useEffect(() => {
    function loadInbox() {
      // The open conversation is asked for by id, so one started from a
      // match card stays listed before its first message is sent.
      const open = selectedRef.current;
      // A failed poll (dropped connection, phone asleep) keeps what's on
      // screen and tries again on the next tick; only a first load that
      // fails says so.
      getJson<{ conversations?: Conversation[]; missedCalls?: number }>(open ? `/api/inbox?match=${encodeURIComponent(open)}` : "/api/inbox")
        .then((body) => {
          if (!body) {
            setLoadFailed(true);
            return;
          }
          setLoadFailed(false);
          const fresh: Conversation[] = body.conversations ?? [];
          // The open thread already marks its own messages read as they
          // arrive, but there's a brief window between that happening and
          // this poll picking it up server-side -- don't let a poll that
          // lands in that window flash the badge back on for the
          // conversation the user is already looking at.
          const shown = fresh.map((c) => (c.matchId === selectedRef.current ? { ...c, unreadCount: 0 } : c));
          setConversations(shown);
          setMissedCalls(body.missedCalls ?? 0);
          // The tab badge polls on its own clock; when this list sees a
          // different count, have it catch up so the two never disagree.
          const total = shown.reduce((sum, c) => sum + c.unreadCount, 0) + (body.missedCalls ?? 0);
          if (total !== unreadTotal.current) {
            unreadTotal.current = total;
            announceUnreadChanged();
          }
        });
    }

    loadInbox();
    // Without this, only the thread the user has open ever updates (via
    // handleMessage) -- every other conversation's preview, ordering, and
    // unread badge, plus any conversation someone starts after this page
    // loaded, would stay stale until a full reload.
    const interval = setInterval(loadInbox, INBOX_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  function handleMessage(matchId: string, message: ThreadMessage) {
    setConversations((cs) => {
      if (!cs) return cs;
      const updated = cs.map((c) =>
        c.matchId === matchId
          ? { ...c, lastMessage: { body: message.body, createdAt: message.created_at } }
          : c,
      );
      return [...updated].sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)));
    });
  }

  function removeConversation(matchId: string) {
    setConversations((cs) => cs?.filter((c) => c.matchId !== matchId) ?? cs);
    closeChat();
  }

  function urlWithMatch(matchId: string | null) {
    const params = new URLSearchParams(window.location.search);
    if (matchId) params.set("match", matchId);
    else params.delete("match");
    const query = params.toString();
    return window.location.pathname + (query ? `?${query}` : "");
  }

  function closeChat() {
    if (pushedChat.current) {
      pushedChat.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", urlWithMatch(null));
    }
  }

  function switchTab(next: "chats" | "calls") {
    if (next === tab) return;
    const params = new URLSearchParams(window.location.search);
    if (next === "calls") params.set("tab", "calls");
    else params.delete("tab");
    const query = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
    // Looking at Calls clears the missed count (CallLog tells the server).
    if (next === "calls") setMissedCalls(0);
  }

  function select(matchId: string) {
    if (matchId === selected) return;
    // Switching chats side by side (wide screens) doesn't pile up Back steps.
    if (selected) {
      window.history.replaceState(null, "", urlWithMatch(matchId));
    } else {
      pushedChat.current = true;
      window.history.pushState(null, "", urlWithMatch(matchId));
    }
    setConversations((cs) => cs?.map((c) => (c.matchId === matchId ? { ...c, unreadCount: 0 } : c)) ?? cs);
  }

  const filteredConversations = conversations?.filter((c) =>
    c.counterpart.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const selectedConversation = conversations?.find((c) => c.matchId === selected) ?? null;

  // An open chat takes the whole phone screen: its own header (with back)
  // replaces the app's top bar and tabs -- see html[data-chat] in globals.css.
  const chatOpen = !!selected;
  useEffect(() => {
    if (!chatOpen) return;
    document.documentElement.dataset.chat = "open";
    return () => {
      delete document.documentElement.dataset.chat;
    };
  }, [chatOpen]);
  useChatViewport(chatOpen);
  const selectedIndex = conversations?.findIndex((c) => c.matchId === selected) ?? -1;

  return (
    <div className="h-full flex min-h-0">
      <div
        className={`${selected ? "hidden sm:flex" : "flex"} w-full sm:w-80 sm:shrink-0 flex-col border-e border-border`}
      >
        <div className="px-4 py-3 border-b border-border shrink-0 flex flex-col gap-3">
          <h1 className="font-display text-xl font-bold">{t("title")}</h1>
          <div role="tablist" className="grid grid-cols-2 rounded-full bg-surface-sunken p-1">
            {(["chats", "calls"] as const).map((key) => {
              const unread = key === "calls" ? missedCalls : (conversations ?? []).reduce((sum, c) => sum + c.unreadCount, 0);
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => switchTab(key)}
                  className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-medium transition ${
                    tab === key ? "bg-surface text-ink shadow-sm" : "text-muted"
                  }`}
                >
                  {t(key === "chats" ? "tabChats" : "tabCalls")}
                  {unread > 0 && (
                    <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white ${key === "calls" ? "bg-danger" : "bg-primary"}`}>
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {tab === "chats" && conversations && conversations.length > 0 && (
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search")}
                aria-label={t("search")}
                className={ui.input + " rounded-full ps-9! py-2!"}
              />
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {tab === "calls" ? (
            <CallLog onOpenChat={select} />
          ) : (
          <>
          {!conversations && loadFailed && <p className="p-4 text-sm text-muted">{t("loadError")}</p>}
          {!conversations && !loadFailed && <RowListSkeleton label={t("loading")} />}
          {conversations && conversations.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <ConnectIllustration className="h-24 w-auto" />
              <p className="text-sm text-muted">{t("empty")}</p>
              <Link href="/categories" className={ui.buttonPrimary}>
                {t("emptyAction")}
              </Link>
            </div>
          )}
          {conversations && conversations.length > 0 && filteredConversations?.length === 0 && (
            <p className="text-sm text-muted p-4">{t("noResults", { query })}</p>
          )}
          {filteredConversations?.map((c) => (
            <button
              key={c.matchId}
              type="button"
              onClick={() => select(c.matchId)}
              className={`w-full flex items-center gap-3 p-4 text-start border-b border-border transition-colors ${
                selected === c.matchId ? "bg-surface-sunken" : "hover:bg-surface-sunken/60"
              }`}
            >
              {c.counterpart.photoUrl ? (
                <Image
                  src={c.counterpart.photoUrl}
                  alt=""
                  width={48}
                  height={48}
                  unoptimized={!canOptimize(c.counterpart.photoUrl)}
                  className="h-12 w-12 rounded-full object-cover shrink-0"
                />
              ) : (
                <AvatarIllustration name={c.counterpart.name} className="h-12 w-12 rounded-full shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="font-display font-semibold truncate">{c.counterpart.name}</p>
                    <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      {tNav.has(c.categorySlug) ? tNav(c.categorySlug) : c.categorySlug}
                    </span>
                  </div>
                  {lastActivity(c) && (
                    <span className="text-xs text-muted shrink-0">
                      {relativeTime(lastActivity(c), locale)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  {c.lastCall && c.lastCall.createdAt > (c.lastMessage?.createdAt ?? "") ? (
                    // The latest thing here was a call.
                    (() => {
                      const outcome = callOutcome(c.lastCall);
                      return (
                        <p className={`flex min-w-0 items-center gap-1 text-sm ${outcome === "missed" ? "text-danger" : "text-muted"}`}>
                          <CallArrow outgoing={c.lastCall.outgoing} />
                          <span className="truncate">{tCalls(outcome === "talked" ? "log.voiceCall" : `log.${outcome}`)}</span>
                        </p>
                      );
                    })()
                  ) : (
                    <p dir={c.lastMessage ? "auto" : undefined} className="text-sm text-muted truncate">
                      {c.lastMessage ? previewText(c.lastMessage.body) : t("noMessagesYet")}
                    </p>
                  )}
                  {c.unreadCount > 0 && (
                    <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold shrink-0">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
          </>
          )}
        </div>
      </div>

      <div data-no-drawer-swipe={selected ? "" : undefined} className={`${selected ? "flex" : "hidden sm:flex"} flex-1 min-w-0 flex-col`}>
        {selectedConversation ? (
          <>
            <ConversationHeader
              key={`header-${selectedConversation.matchId}`}
              matchId={selectedConversation.matchId}
              name={selectedConversation.counterpart.name}
              photoUrl={selectedConversation.counterpart.photoUrl}
              tone={TONES[selectedIndex % TONES.length]}
              profileId={selectedConversation.counterpart.id}
              subtitle={[tNav.has(selectedConversation.categorySlug) ? tNav(selectedConversation.categorySlug) : "", selectedConversation.about]
                .filter(Boolean)
                .join(" · ")}
              onBack={closeChat}
              onBlocked={() => removeConversation(selectedConversation.matchId)}
            />
            <ChatThread
              key={`thread-${selectedConversation.matchId}`}
              matchId={selectedConversation.matchId}
              variant="full"
              counterpart={{ name: selectedConversation.counterpart.name, photoUrl: selectedConversation.counterpart.photoUrl }}
              onMessage={(m) => handleMessage(selectedConversation.matchId, m)}
            />
          </>
        ) : selected && !conversations ? (
          // A conversation was asked for (e.g. Message on a match card) and
          // is still loading -- don't tell the user to go pick one.
          <RowListSkeleton count={1} label={t("loading")} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
            <ConnectIllustration className="h-28 w-auto opacity-80" />
            <p className="text-sm text-muted text-center">{t("selectConversation")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
