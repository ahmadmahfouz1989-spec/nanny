"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/voice-notes";
import { MATCHES_API } from "@/lib/matching/match-access";
import ChatComposer from "./chat-composer";
import ChatMessage, { type ChatMessageData } from "./chat-message";
import { useVoiceRecorder, type RecordedVoiceNote } from "./use-voice-recorder";

type Message = ChatMessageData;

// Realtime delivers new messages as they land; this slower refresh is only
// a safety net for a dropped/reconnecting channel, and keeps long-lived
// voice-note URLs from expiring under an open thread.
const SAFETY_REFRESH_MS = 30000;
// Every GET re-signs every voice note, but swapping a still-valid URL on
// each refresh would reload any <audio> that's mid-playback. Only take the
// fresh one once the held URL is missing (signing failed earlier) or has
// used up most of its lifetime.
const AUDIO_URL_REFRESH_AFTER_MS = SIGNED_URL_TTL_SECONDS * 1000 * 0.75;

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** A match's chat thread (any category). */
export default function ChatThread({
  matchId,
  onMessage,
  variant = "compact",
}: {
  matchId: string;
  onMessage?: (message: Message) => void;
  variant?: "compact" | "full";
}) {
  const threadUrl = `${MATCHES_API}/${matchId}/messages`;
  const t = useTranslations("Matches");
  const locale = useLocale();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Follow new messages only when the reader is already at the bottom --
  // an incoming message shouldn't yank someone who has scrolled up to
  // read older history back down.
  const isNearBottomRef = useRef(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // The realtime handler is bound once per thread, so it reads the viewer's
  // id from here rather than from whatever render captured `userId`.
  const userIdRef = useRef<string | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const onMessageRef = useRef(onMessage);
  // Only the dedicated older-history fetch (loadOlder) should ever narrow
  // hasMoreOlder once it's been used -- otherwise a realtime-triggered
  // refreshMessages() call stomps it back to whatever that window alone
  // implies, ignoring how much further back the reader has actually paged.
  const olderLoadedRef = useRef(false);
  // When each message's currently-held audioUrl was received, keyed by id.
  const audioUrlReceivedAtRef = useRef(new Map<string, number>());
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  function markRead() {
    // Only the dedicated Messages thread (variant "full") represents the user
    // deliberately opening a conversation -- the compact widget embedded on
    // match cards renders unconditionally, so mounting it shouldn't clear
    // the unread badge before the user has actually looked at their inbox.
    if (variant === "full") fetch(`${threadUrl}/read`, { method: "PATCH" });
  }

  function refreshMessages() {
    fetch(threadUrl)
      .then((res) => res.json())
      .then((body) => {
        const now = Date.now();
        const receivedAt = audioUrlReceivedAtRef.current;
        // This fetch always returns the newest window, regardless of how
        // far back loadOlder has already paged -- its own hasMore is only
        // trustworthy as the initial value, before there's any older
        // history loaded to contradict it.
        if (!olderLoadedRef.current) setHasMoreOlder(body.hasMore ?? false);
        setMessages((prev) => {
          const prevById = new Map((prev ?? []).map((m) => [m.id, m]));
          const next: Message[] = ((body.messages ?? []) as Message[]).map((m) => {
            if (!m.audio_path) return m;
            const held = prevById.get(m.id);
            if (held?.audioUrl) {
              // A URL that arrived some other way (send, upload, loadOlder)
              // was signed just before it got here -- start its clock now.
              if (!receivedAt.has(m.id)) receivedAt.set(m.id, now);
              if (now - receivedAt.get(m.id)! < AUDIO_URL_REFRESH_AFTER_MS) {
                return { ...m, audioUrl: held.audioUrl };
              }
            }
            if (m.audioUrl) receivedAt.set(m.id, now);
            return m;
          });
          if (!prev) return next;
          // Merge, don't replace: prev may hold history loaded further
          // back via loadOlder that this newest-window fetch knows nothing
          // about.
          const nextIds = new Set(next.map((m) => m.id));
          const cutoff = next[0]?.created_at;
          const older = prev.filter((m) => !nextIds.has(m.id) && (!cutoff || m.created_at < cutoff));
          const merged = [...older, ...next];
          // Keep the same array reference when nothing actually changed --
          // a refresh that just re-confirms the same messages shouldn't
          // re-trigger the scroll effect and yank a reader who has scrolled
          // up back down to the bottom.
          if (prev.length === merged.length && prev.every((m, i) => m.id === merged[i]?.id)) {
            // Same messages -- but a voice note may have just gained (or
            // renewed) its playable URL, which does need to reach the UI.
            const urlChanged = prev.some((m, i) => m.audioUrl !== merged[i]?.audioUrl);
            return urlChanged ? merged : prev;
          }
          return merged;
        });
      });
  }

  function loadOlder() {
    if (!messages || messages.length === 0 || loadingOlder) return;
    setLoadingOlder(true);
    olderLoadedRef.current = true;
    const oldest = messages[0]!.created_at;
    const el = listRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    fetch(`${threadUrl}?before=${encodeURIComponent(oldest)}`)
      .then((res) => res.json())
      .then((body) => {
        setMessages((prev) => [...(body.messages ?? []), ...(prev ?? [])]);
        setHasMoreOlder(body.hasMore ?? false);
        // isNearBottomRef is false here (the user had to scroll up to reach
        // this button), so the scroll effect leaves position alone --
        // restore it manually so prepending doesn't shift what's in view.
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevScrollHeight;
        });
      })
      .finally(() => setLoadingOlder(false));
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      userIdRef.current = data.user?.id ?? null;
      setUserId(userIdRef.current);
    });

    refreshMessages();
    markRead();

    const channel = supabase
      .channel(`generic_messages:${matchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "generic_messages", filter: `match_id=eq.${matchId}` },
        (payload) => {
          const incoming = payload.new as Message;
          if (incoming.audio_path) {
            // The raw realtime row has no signed URL -- only the GET route
            // (service role) can mint one, so re-fetch instead of
            // appending the bare payload.
            refreshMessages();
          } else {
            setMessages((prev) => {
              if (!prev) return [incoming];
              if (prev.some((m) => m.id === incoming.id)) return prev;
              return [...prev, incoming];
            });
          }
          onMessageRef.current?.(incoming);
          // New content arrived while the thread is open -- re-mark read,
          // or it would stay unread server-side until the thread is
          // closed and reopened.
          if (incoming.sender_id !== userIdRef.current) markRead();
        },
      )
      .subscribe();

    const safetyRefresh = setInterval(refreshMessages, SAFETY_REFRESH_MS);

    return () => {
      clearInterval(safetyRefresh);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, variant]);

  useEffect(() => {
    // Scroll only this thread's own container to the bottom — never
    // scrollIntoView, which would also scroll the page (the compact widget
    // is embedded mid-page on the dashboard).
    const el = listRef.current;
    if (el && isNearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  // The specific reason the server refused a message (daily limit, blocked,
  // profile unavailable -- see SEND_REFUSALS in match-routes.ts), else the
  // generic fallback.
  async function refusalText(res: Response, fallback: string) {
    const body = await res.json().catch(() => ({}));
    const key = `sendRefused.${body.code}`;
    return typeof body.code === "string" && t.has(key) ? t(key) : fallback;
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    setDraft("");
    try {
      const res = await fetch(threadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        restoreDraft(body);
        setSendError(await refusalText(res, t("messageSendError")));
        return;
      }
      const { message } = await res.json();
      isNearBottomRef.current = true;
      setMessages((prev) => {
        const withoutOptimistic = prev ?? [];
        if (withoutOptimistic.some((m) => m.id === message.id)) return withoutOptimistic;
        return [...withoutOptimistic, message];
      });
      onMessageRef.current?.(message);
    } catch {
      restoreDraft(body);
      setSendError(t("messageSendError"));
    } finally {
      setSending(false);
    }
  }

  // The composer stays editable while a send is in flight -- only put the
  // failed text back if the user hasn't started typing something new.
  function restoreDraft(failedBody: string) {
    setDraft((current) => (current === "" ? failedBody : current));
  }

  async function uploadRecording({ blob, extension, seconds }: RecordedVoiceNote) {
    setUploadError(null);
    setUploadingAudio(true);
    const formData = new FormData();
    formData.append("file", blob, `voice-note.${extension}`);
    formData.append("durationSeconds", String(seconds));

    // A network failure rejects fetch() itself (not just a non-ok
    // response) -- without try/finally that skips setUploadingAudio(false)
    // and leaves the composer disabled until the page is reloaded, with no
    // way to retry.
    try {
      const res = await fetch(`${threadUrl}/audio`, { method: "POST", body: formData });
      if (!res.ok) {
        setUploadError(await refusalText(res, t("voiceNoteUploadError")));
        return;
      }

      const { message } = await res.json();
      isNearBottomRef.current = true;
      setMessages((prev) => {
        const withoutOptimistic = prev ?? [];
        if (withoutOptimistic.some((m) => m.id === message.id)) return withoutOptimistic;
        return [...withoutOptimistic, message];
      });
      onMessageRef.current?.(message);
    } catch {
      setUploadError(t("voiceNoteUploadError"));
    } finally {
      setUploadingAudio(false);
    }
  }

  const recorder = useVoiceRecorder(uploadRecording);

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
        ref={listRef}
        onScroll={handleScroll}
        className={
          full
            ? "flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 p-4"
            : "max-h-64 overflow-y-auto flex flex-col gap-2 p-3"
        }
      >
        {messages && messages.length === 0 && (
          <p className="text-sm text-muted text-center py-4">{t("chatEmpty")}</p>
        )}
        {full && hasMoreOlder && (
          <button
            type="button"
            onClick={loadOlder}
            disabled={loadingOlder}
            className={ui.buttonGhost + " text-xs mx-auto mb-2"}
          >
            {loadingOlder ? t("loadingMore") : t("loadEarlierMessages")}
          </button>
        )}
        {messages?.map((m, i) => {
          const prev = messages[i - 1];
          const showDayDivider = !prev || !isSameDay(new Date(prev.created_at), new Date(m.created_at));
          return (
            <ChatMessage
              key={m.id}
              message={m}
              own={m.sender_id === userId}
              dayLabel={full && showDayDivider ? formatDayLabel(m.created_at) : undefined}
              time={full ? formatTime(m.created_at) : undefined}
            />
          );
        })}
      </div>

      {(recorder.error ?? uploadError) && (
        <p className="px-3 pt-2 text-xs text-danger">{recorder.error ?? uploadError}</p>
      )}
      {sendError && <p className="px-3 pt-2 text-xs text-danger">{sendError}</p>}

      <ChatComposer
        compact={!full}
        draft={draft}
        onDraftChange={setDraft}
        onSend={send}
        sending={sending}
        uploading={uploadingAudio}
        recording={recorder.recording}
        recordingSeconds={recorder.seconds}
        onStartRecording={() => {
          setUploadError(null);
          recorder.start();
        }}
        onStopRecording={recorder.stop}
        onCancelRecording={recorder.cancel}
      />
    </div>
  );
}
