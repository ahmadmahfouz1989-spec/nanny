"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";
import { SendIcon, MicIcon, TrashIcon } from "@/components/nav-icons";
import { MAX_RECORDING_SECONDS, SIGNED_URL_TTL_SECONDS, pickAudioMimeType, formatAudioDuration } from "@/lib/voice-notes";
import { MATCH_SOURCES, type MatchSource } from "@/lib/matching/match-access";

type Message = {
  id: string;
  sender_id: string;
  body: string;
  audio_path: string | null;
  audio_duration_seconds: number | null;
  audioUrl?: string | null;
  created_at: string;
};

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

/**
 * One chat thread for every category: `source` picks nanny/parent's
 * `matches` or the generic (nursing, tutoring, ...) `generic_matches`
 * store -- the API routes and realtime table differ, nothing else does.
 */
export default function ChatThread({
  matchId,
  source = "nanny",
  onMessage,
  variant = "compact",
}: {
  matchId: string;
  source?: MatchSource;
  onMessage?: (message: Message) => void;
  variant?: "compact" | "full";
}) {
  const { apiBase, messagesTable } = MATCH_SOURCES[source];
  const threadUrl = `${apiBase}/${matchId}/messages`;
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
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const onMessageRef = useRef(onMessage);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // uploadRecording's closure over recordingSeconds (state) is only ever as
  // current as whichever render captured it -- onstop is bound once, at the
  // moment recording starts, so it always saw 0. Track the live value here
  // instead.
  const recordingSecondsRef = useRef(0);
  const cancelledRef = useRef(false);
  // getUserMedia's permission prompt can still be pending when the user
  // leaves this thread (it's keyed by matchId, so that's an unmount, not a
  // prop update) -- the unmount cleanup below can only stop a MediaRecorder
  // that already exists, not cancel a still-in-flight promise. Checked
  // right after that await resolves so a late grant can never start a
  // recorder (against this now-stale matchId closure) after the thread is
  // already gone.
  const mountedRef = useRef(true);
  const requestingMicRef = useRef(false);
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

  // Stop everything if this thread unmounts mid-recording -- e.g. the user
  // switches to another conversation (this thread is keyed by matchId, so
  // that's an unmount, not a prop update). Without this the mic track
  // keeps running, and if the max-duration timer later fires the stale
  // MediaRecorder's onstop handler, it would still upload a voice note
  // against this now-defunct matchId closure.
  useEffect(() => {
    // Set here, not just in useRef's initial value: Strict Mode's dev-only
    // effect replay runs this cleanup and then this setup again on the
    // same still-mounted component, and without resetting these the
    // thread would treat itself as unmounted for its whole life.
    mountedRef.current = true;
    cancelledRef.current = false;
    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

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
      .channel(`${messagesTable}:${matchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: messagesTable, filter: `match_id=eq.${matchId}` },
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
  }, [matchId, source, variant]);

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
        setSendError(t("messageSendError"));
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

  async function startRecording() {
    setAudioError(null);
    if (requestingMicRef.current) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setAudioError(t("micNotSupported"));
      return;
    }

    requestingMicRef.current = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      requestingMicRef.current = false;
      setAudioError(t("micPermissionDenied"));
      return;
    }
    requestingMicRef.current = false;

    if (!mountedRef.current) {
      // The thread was left while the permission prompt was pending --
      // never start a recorder against this now-stale matchId closure.
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    cancelledRef.current = false;
    chunksRef.current = [];
    const mimeType = pickAudioMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (!cancelledRef.current) uploadRecording(recorder.mimeType || mimeType || "audio/webm");
      setRecording(false);
      setRecordingSeconds(0);
    };

    recorder.start();
    setRecording(true);
    recordingSecondsRef.current = 0;
    setRecordingSeconds(0);
    recordingTimerRef.current = setInterval(() => {
      recordingSecondsRef.current += 1;
      if (recordingSecondsRef.current >= MAX_RECORDING_SECONDS) {
        mediaRecorderRef.current?.stop();
      }
      setRecordingSeconds(recordingSecondsRef.current);
    }, 1000);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function cancelRecording() {
    cancelledRef.current = true;
    mediaRecorderRef.current?.stop();
  }

  async function uploadRecording(mimeType: string) {
    // recorder.mimeType comes back with a codec suffix (e.g.
    // "audio/webm;codecs=opus") -- strip it so the Blob's type is exactly
    // one of the server/bucket's allowed MIME types, not a variant of one.
    const baseMimeType = mimeType.split(";")[0]!;
    const blob = new Blob(chunksRef.current, { type: baseMimeType });
    if (blob.size === 0) return;

    setUploadingAudio(true);
    const formData = new FormData();
    const ext = baseMimeType.includes("mp4") ? "mp4" : baseMimeType.includes("ogg") ? "ogg" : "webm";
    formData.append("file", blob, `voice-note.${ext}`);
    formData.append("durationSeconds", String(recordingSecondsRef.current));

    // A network failure rejects fetch() itself (not just a non-ok
    // response) -- without try/finally that skips setUploadingAudio(false)
    // and leaves the composer disabled until the page is reloaded, with no
    // way to retry.
    try {
      const res = await fetch(`${threadUrl}/audio`, { method: "POST", body: formData });
      if (!res.ok) {
        setAudioError(t("voiceNoteUploadError"));
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
      setAudioError(t("voiceNoteUploadError"));
    } finally {
      setUploadingAudio(false);
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
          const own = m.sender_id === userId;
          const prev = messages[i - 1];
          const showDayDivider = !prev || !isSameDay(new Date(prev.created_at), new Date(m.created_at));
          return (
            <div key={m.id} className="flex flex-col">
              {full && showDayDivider && (
                <p className="text-center text-[11px] font-medium text-muted my-3 first:mt-0">
                  {formatDayLabel(m.created_at)}
                </p>
              )}
              <div
                dir="auto"
                className={`max-w-[85%] sm:max-w-md rounded-2xl text-sm ${
                  m.audio_path ? "p-2" : "px-3.5 py-2"
                } ${own ? "self-end bg-primary text-white" : "self-start bg-surface-sunken text-ink"}`}
              >
                {m.audio_path ? (
                  m.audioUrl ? (
                    <audio controls preload="metadata" src={m.audioUrl} className="h-9 w-56 max-w-full" />
                  ) : (
                    <span className="text-xs opacity-80 px-1.5">{t("voiceNoteLoading")}</span>
                  )
                ) : (
                  m.body
                )}
              </div>
              {full && (
                <span className={`text-[11px] text-muted mt-0.5 ${own ? "self-end" : "self-start"}`}>
                  {formatTime(m.created_at)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {audioError && <p className="px-3 pt-2 text-xs text-danger">{audioError}</p>}
      {sendError && <p className="px-3 pt-2 text-xs text-danger">{sendError}</p>}

      <div className={full ? "flex items-center gap-2 p-3 border-t border-border shrink-0" : "flex items-center gap-2 p-2 border-t border-border"}>
        {recording ? (
          <>
            <button
              type="button"
              onClick={cancelRecording}
              aria-label={t("cancelRecording")}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-danger-soft hover:text-danger"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
            <div className="flex-1 flex items-center gap-2 rounded-full bg-danger-soft px-4 py-2">
              <span className="h-2 w-2 rounded-full bg-danger animate-pulse" />
              <span className="text-sm text-danger font-medium">{t("recording")}</span>
              <span className="text-sm text-danger/80 tabular-nums ms-auto">{formatAudioDuration(recordingSeconds)}</span>
            </div>
            <button
              type="button"
              onClick={stopRecording}
              aria-label={t("sendRecording")}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-hover"
            >
              <SendIcon className="h-4 w-4 rtl:scale-x-[-1]" />
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              dir="auto"
              className={ui.input + " flex-1 rounded-full"}
              placeholder={t("chatPlaceholder")}
              value={draft}
              disabled={uploadingAudio}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            {draft.trim() ? (
              <button
                type="button"
                onClick={send}
                disabled={sending}
                aria-label={t("chatSend")}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-hover disabled:opacity-50"
              >
                <SendIcon className="h-4 w-4 rtl:scale-x-[-1]" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={uploadingAudio}
                aria-label={t("recordVoiceNote")}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-hover disabled:opacity-50"
              >
                <MicIcon className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
