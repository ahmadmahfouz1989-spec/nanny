"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import SubscribeModal from "@/components/subscribe-modal";
import { ui } from "@/lib/ui";

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function ChatThread({
  matchId,
  onMessage,
  variant = "compact",
}: {
  matchId: string;
  onMessage?: (message: Message) => void;
  variant?: "compact" | "full";
}) {
  const t = useTranslations("Matches");
  const locale = useLocale();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [paywalled, setPaywalled] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));

    fetch(`/api/matches/${matchId}/messages`)
      .then((res) => res.json())
      .then((body) => setMessages(body.messages ?? []));

    // Only the dedicated Messages thread (variant "full") represents the user
    // deliberately opening a conversation — the compact widget embedded on
    // match cards renders unconditionally, so mounting it shouldn't clear
    // the unread badge before the user has actually looked at their inbox.
    if (variant === "full") {
      fetch(`/api/matches/${matchId}/messages/read`, { method: "PATCH" });
    }

    const channel = supabase
      .channel(`messages:${matchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `match_id=eq.${matchId}` },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((prev) => {
            if (!prev) return [incoming];
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
          onMessageRef.current?.(incoming);
          if (variant === "full") {
            fetch(`/api/matches/${matchId}/messages/read`, { method: "PATCH" });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, variant]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    const res = await fetch(`/api/matches/${matchId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setSending(false);
    if (res.status === 402) {
      setPaywalled(true);
      setDraft(body);
      return;
    }
    if (res.ok) {
      const { message } = await res.json();
      setMessages((prev) => {
        const withoutOptimistic = prev ?? [];
        if (withoutOptimistic.some((m) => m.id === message.id)) return withoutOptimistic;
        return [...withoutOptimistic, message];
      });
      onMessageRef.current?.(message);
    }
  }

  function formatTime(iso: string) {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  }

  function formatDayLabel(iso: string) {
    const date = new Date(iso);
    if (isSameDay(date, new Date())) return t("today");
    return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(date);
  }

  const full = variant === "full";

  return (
    <div className={full ? "flex flex-col h-full" : "mt-4 rounded-xl border border-border bg-background"}>
      {!full && (
        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted border-b border-border">
          {t("chatTitle")}
        </p>
      )}

      <div
        className={
          full
            ? "flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 p-4"
            : "max-h-64 overflow-y-auto flex flex-col gap-2 p-3"
        }
      >
        {messages && messages.length === 0 && (
          <p className="text-sm text-muted text-center py-4">{t("chatEmpty")}</p>
        )}
        {messages?.map((m, i) => {
          const own = m.sender_id === userId;
          const prev = messages[i - 1];
          const showDayDivider = !prev || !isSameDay(new Date(prev.created_at), new Date(m.created_at));
          return (
            <div key={m.id} className="flex flex-col">
              {full && showDayDivider && (
                <div className="flex items-center gap-3 my-3 first:mt-0">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-medium text-muted shrink-0">{formatDayLabel(m.created_at)}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-sm ${
                  own ? "self-end bg-primary text-white" : "self-start bg-surface border border-border"
                }`}
              >
                {m.body}
              </div>
              {full && (
                <span className={`text-[11px] text-muted mt-0.5 ${own ? "self-end" : "self-start"}`}>
                  {formatTime(m.created_at)}
                </span>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <SubscribeModal open={paywalled} onClose={() => setPaywalled(false)} />

      <div className={full ? "flex items-center gap-2 p-3 border-t border-border shrink-0" : "flex items-center gap-2 p-2 border-t border-border"}>
        <input
          type="text"
          className={ui.input + " flex-1"}
          placeholder={t("chatPlaceholder")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !draft.trim()}
          className={ui.buttonPrimary + " px-4! py-2! text-sm"}
        >
          {t("chatSend")}
        </button>
      </div>
    </div>
  );
}
