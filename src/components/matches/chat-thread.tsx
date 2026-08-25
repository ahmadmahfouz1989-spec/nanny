"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export default function ChatThread({
  matchId,
  onMessage,
}: {
  matchId: string;
  onMessage?: (message: Message) => void;
}) {
  const t = useTranslations("Matches");
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
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

    fetch(`/api/matches/${matchId}/messages/read`, { method: "PATCH" });

    const channel = supabase
      .channel(`messages:${matchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `match_id=eq.${matchId}` },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((prev) => (prev ? [...prev, incoming] : [incoming]));
          onMessageRef.current?.(incoming);
          fetch(`/api/matches/${matchId}/messages/read`, { method: "PATCH" });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

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

  return (
    <div className="mt-4 rounded-xl border border-border bg-background">
      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted border-b border-border">
        {t("chatTitle")}
      </p>

      <div className="max-h-64 overflow-y-auto flex flex-col gap-2 p-3">
        {messages && messages.length === 0 && (
          <p className="text-sm text-muted text-center py-4">{t("chatEmpty")}</p>
        )}
        {messages?.map((m) => {
          const own = m.sender_id === userId;
          return (
            <div
              key={m.id}
              className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-sm ${
                own ? "self-end bg-primary text-white" : "self-start bg-surface border border-border"
              }`}
            >
              {m.body}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 p-2 border-t border-border">
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
