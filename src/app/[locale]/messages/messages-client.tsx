"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import ChatThread from "@/components/matches/chat-thread";
import ConversationHeader from "@/components/matches/conversation-header";
import GenericChatThread from "@/components/matches/generic-chat-thread";
import GenericConversationHeader from "@/components/matches/generic-conversation-header";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import { SearchIcon } from "@/components/nav-icons";
import { ui } from "@/lib/ui";

const TONES = ["primary", "secondary", "berry"] as const;

type Conversation = {
  matchId: string;
  // "nanny" for the legacy matches table, a category slug (e.g. "nursing")
  // for a generic_matches conversation.
  source: string;
  counterpart: { id: string; name: string; photoUrl: string | null };
  lastMessage: { body: string; createdAt: string } | null;
  unreadCount: number;
};

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
  const tMatches = useTranslations("Matches");
  const tNav = useTranslations("Nav");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [role, setRole] = useState<"parent" | "nanny" | null>(null);
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [selected, setSelected] = useState<string | null>(searchParams.get("match"));
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/inbox")
      .then((res) => res.json())
      .then((body) => {
        setRole(body.role ?? null);
        setConversations(body.conversations ?? []);
      });
  }, []);

  function handleMessage(matchId: string, message: ThreadMessage) {
    setConversations((cs) => {
      if (!cs) return cs;
      const updated = cs.map((c) =>
        c.matchId === matchId
          ? { ...c, lastMessage: { body: message.body, createdAt: message.created_at } }
          : c,
      );
      return [...updated].sort((a, b) => {
        const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return bt - at;
      });
    });
  }

  function select(matchId: string) {
    setSelected(matchId);
    setConversations((cs) => cs?.map((c) => (c.matchId === matchId ? { ...c, unreadCount: 0 } : c)) ?? cs);
  }

  const filteredConversations = conversations?.filter((c) =>
    c.counterpart.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const selectedConversation = conversations?.find((c) => c.matchId === selected) ?? null;
  const selectedIndex = conversations?.findIndex((c) => c.matchId === selected) ?? -1;
  const counterpartProfileType = role === "parent" ? "nanny" : "parent";

  return (
    <div className="h-full flex min-h-0">
      <div
        className={`${selected ? "hidden sm:flex" : "flex"} w-full sm:w-80 sm:shrink-0 flex-col border-e border-border`}
      >
        <div className="px-4 py-3 border-b border-border shrink-0 flex flex-col gap-3">
          <h1 className="font-display text-xl font-bold">{t("title")}</h1>
          {conversations && conversations.length > 0 && (
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search")}
                className={ui.input + " rounded-full ps-9! py-2!"}
              />
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {!conversations && <p className="text-sm text-muted p-4">{tMatches("loading")}</p>}
          {conversations && conversations.length === 0 && (
            <p className="text-sm text-muted p-4">{t("empty")}</p>
          )}
          {conversations && conversations.length > 0 && filteredConversations?.length === 0 && (
            <p className="text-sm text-muted p-4">{t("noResults", { query })}</p>
          )}
          {filteredConversations?.map((c, i) => (
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
                  unoptimized
                  className="h-12 w-12 rounded-full object-cover shrink-0"
                />
              ) : (
                <AvatarIllustration tone={TONES[i % TONES.length]} className="h-12 w-12 rounded-full shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="font-display font-semibold truncate">{c.counterpart.name}</p>
                    {c.source !== "nanny" && (
                      <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-muted">
                        {tNav.has(c.source) ? tNav(c.source) : c.source}
                      </span>
                    )}
                  </div>
                  {c.lastMessage && (
                    <span className="text-xs text-muted shrink-0">
                      {relativeTime(c.lastMessage.createdAt, locale)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-muted truncate">
                    {c.lastMessage ? c.lastMessage.body : t("noMessagesYet")}
                  </p>
                  {c.unreadCount > 0 && (
                    <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-white text-xs font-semibold shrink-0">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className={`${selected ? "flex" : "hidden sm:flex"} flex-1 min-w-0 flex-col`}>
        {selectedConversation ? (
          selectedConversation.source === "nanny" ? (
            <>
              <ConversationHeader
                matchId={selectedConversation.matchId}
                name={selectedConversation.counterpart.name}
                photoUrl={selectedConversation.counterpart.photoUrl}
                tone={TONES[selectedIndex % TONES.length]}
                profileId={selectedConversation.counterpart.id}
                profileType={counterpartProfileType}
                onBack={() => setSelected(null)}
              />
              <ChatThread
                key={selectedConversation.matchId}
                matchId={selectedConversation.matchId}
                variant="full"
                onMessage={(m) => handleMessage(selectedConversation.matchId, m)}
              />
            </>
          ) : (
            <>
              <GenericConversationHeader
                matchId={selectedConversation.matchId}
                name={selectedConversation.counterpart.name}
                tone={TONES[selectedIndex % TONES.length]}
                onBack={() => setSelected(null)}
              />
              <GenericChatThread
                key={selectedConversation.matchId}
                matchId={selectedConversation.matchId}
                onMessage={(m) => handleMessage(selectedConversation.matchId, m)}
              />
            </>
          )
        ) : (
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-sm text-muted text-center">{t("selectConversation")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
