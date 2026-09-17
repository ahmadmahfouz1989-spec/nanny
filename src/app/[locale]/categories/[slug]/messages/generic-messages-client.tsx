"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { SendIcon } from "@/components/nav-icons";

type Conversation = {
  matchId: string;
  counterpart: { id: string; name: string };
  lastMessage: { body: string; createdAt: string } | null;
  unreadCount: number;
};

type ThreadMessage = { id: string; sender_id: string; body: string; created_at: string };

const POLL_MS = 4000;

/**
 * Deliberately simple v1: polling instead of realtime, no voice notes, no
 * read-receipts UI beyond the unread badge -- see the plan's messaging
 * scope note. ChatThread (used by the nanny messages page) is tightly
 * coupled to the `messages` table's realtime channel and audio pipeline,
 * so this is a fresh, minimal component rather than a generalization of it.
 */
export default function GenericMessagesClient({ categorySlug }: { categorySlug: string }) {
  const t = useTranslations("Matches");
  const tInbox = useTranslations("Inbox");
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [selected, setSelected] = useState<string | null>(searchParams.get("match"));
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => setUserId(body?.user?.id ?? null))
      .catch(() => {});
  }, []);

  function loadConversations() {
    fetch(`/api/generic-matches/inbox?categorySlug=${categorySlug}`)
      .then((res) => res.json())
      .then((body) => setConversations(body.conversations ?? []));
  }

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorySlug]);

  function loadThread(matchId: string) {
    fetch(`/api/generic-matches/${matchId}/messages`)
      .then((res) => res.json())
      .then((body) => setMessages(body.messages ?? []));
  }

  useEffect(() => {
    if (!selected) return;
    loadThread(selected);
    fetch(`/api/generic-matches/${selected}/messages`, { method: "PATCH" }).then(loadConversations);
    const interval = setInterval(() => loadThread(selected), POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    if (!selected || !draft.trim()) return;
    setSending(true);
    const res = await fetch(`/api/generic-matches/${selected}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft.trim() }),
    });
    setSending(false);
    if (res.ok) {
      setDraft("");
      loadThread(selected);
      loadConversations();
    }
  }

  const selectedConversation = conversations?.find((c) => c.matchId === selected) ?? null;

  return (
    <div className="flex h-screen">
      <div className="w-full sm:w-80 shrink-0 border-e border-border overflow-y-auto">
        <h1 className="font-display text-lg font-bold px-4 py-4">{tInbox("title")}</h1>
        {conversations && conversations.length === 0 && (
          <p className="text-sm text-muted px-4">{tInbox("empty")}</p>
        )}
        {conversations?.map((c) => (
          <button
            key={c.matchId}
            onClick={() => setSelected(c.matchId)}
            className={`w-full text-start px-4 py-3 border-b border-border hover:bg-surface-sunken transition-colors ${
              selected === c.matchId ? "bg-surface-sunken" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm truncate">{c.counterpart.name}</p>
              {c.unreadCount > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-white text-[11px] font-semibold">
                  {c.unreadCount}
                </span>
              )}
            </div>
            {c.lastMessage && <p className="text-xs text-muted truncate">{c.lastMessage.body}</p>}
          </button>
        ))}
      </div>

      <div className="hidden sm:flex flex-1 flex-col">
        {selectedConversation ? (
          <>
            <div className="px-4 py-4 border-b border-border font-semibold">{selectedConversation.counterpart.name}</div>
            <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
              {messages?.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                    m.sender_id === userId ? "self-end bg-primary text-white" : "self-start bg-surface-sunken"
                  }`}
                >
                  {m.body}
                </div>
              ))}
              {messages?.length === 0 && <p className="text-sm text-muted">{t("chatEmpty")}</p>}
            </div>
            <div className="flex items-center gap-2 px-4 py-4 border-t border-border">
              <input
                className={ui.input}
                placeholder={t("chatPlaceholder")}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <button onClick={send} disabled={sending || !draft.trim()} className={ui.buttonPrimary + " px-4! py-2.5!"}>
                <SendIcon className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted">{tInbox("selectConversation")}</div>
        )}
      </div>
    </div>
  );
}
