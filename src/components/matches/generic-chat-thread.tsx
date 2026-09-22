"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { SendIcon, MicIcon, TrashIcon } from "@/components/nav-icons";
import { MAX_RECORDING_SECONDS, pickAudioMimeType, formatAudioDuration } from "@/lib/voice-notes";

type Message = {
  id: string;
  sender_id: string;
  body: string;
  audio_path: string | null;
  audio_duration_seconds: number | null;
  audioUrl?: string | null;
  created_at: string;
};

const POLL_MS = 4000;

/**
 * The generic-category equivalent of ChatThread (nanny/parent), for the
 * unified /messages inbox -- same matchId/onMessage interface so the
 * inbox can swap between the two based on a conversation's `source`.
 * Polling instead of realtime, same as GenericMessagesClient, which this
 * shares its recording logic with via @/lib/voice-notes.
 */
export default function GenericChatThread({
  matchId,
  onMessage,
}: {
  matchId: string;
  onMessage?: (message: Message) => void;
}) {
  const t = useTranslations("Matches");
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
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
  // The interval closure and the onstop handler (bound once, at the moment
  // recording starts) both need the live elapsed time -- recordingSeconds
  // (state) is only current as of whichever render captured it, so
  // uploadRecording's closure over that state would always see whatever it
  // was at the very start of the recording, not the actual final duration.
  const recordingSecondsRef = useRef(0);
  const cancelledRef = useRef(false);
  // Chat auto-scrolls to the bottom on new messages, but only when the
  // reader was already there -- otherwise polling would keep yanking
  // someone back down while they're scrolled up reading older history.
  const isNearBottomRef = useRef(true);

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
    return () => {
      cancelledRef.current = true;
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  function loadMessages() {
    fetch(`/api/generic-matches/${matchId}/messages`)
      .then((res) => res.json())
      .then((body) => {
        const next: Message[] = body.messages ?? [];
        setHasMoreOlder(body.hasMore ?? false);
        setMessages((prev) => {
          // Keep the same array reference when nothing actually changed --
          // a poll tick that just re-confirms the same messages shouldn't
          // re-trigger the scroll effect below and yank a reader who has
          // scrolled up back down to the bottom.
          if (prev && prev.length === next.length && prev.every((m, i) => m.id === next[i]?.id)) {
            return prev;
          }
          // New content arrived while the thread is open -- re-mark read
          // rather than only doing it once on mount, or messages received
          // during this session would stay unread server-side until the
          // thread is closed and reopened.
          if (prev) fetch(`/api/generic-matches/${matchId}/messages`, { method: "PATCH" });
          return next;
        });
      });
  }

  function loadOlder() {
    if (!messages || messages.length === 0 || loadingOlder) return;
    setLoadingOlder(true);
    const oldest = messages[0]!.created_at;
    const el = listRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    fetch(`/api/generic-matches/${matchId}/messages?before=${encodeURIComponent(oldest)}`)
      .then((res) => res.json())
      .then((body) => {
        setMessages((prev) => [...(body.messages ?? []), ...(prev ?? [])]);
        setHasMoreOlder(body.hasMore ?? false);
        // isNearBottomRef stays false here (the user has to be scrolled up
        // to reach this button), so the auto-scroll effect below leaves the
        // browser's own scroll position alone -- restore it manually so the
        // prepended content doesn't shift what's on screen out of view.
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevScrollHeight;
        });
      })
      .finally(() => setLoadingOlder(false));
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => setUserId(body?.user?.id ?? null))
      .catch(() => {});

    loadMessages();
    fetch(`/api/generic-matches/${matchId}/messages`, { method: "PATCH" });
    const interval = setInterval(loadMessages, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  useEffect(() => {
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
      const res = await fetch(`/api/generic-matches/${matchId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        setDraft(body);
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
      setDraft(body);
      setSendError(t("messageSendError"));
    } finally {
      setSending(false);
    }
  }

  async function startRecording() {
    setAudioError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setAudioError(t("micNotSupported"));
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setAudioError(t("micPermissionDenied"));
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
    const baseMimeType = mimeType.split(";")[0]!;
    const blob = new Blob(chunksRef.current, { type: baseMimeType });
    if (blob.size === 0) return;

    setUploadingAudio(true);
    const formData = new FormData();
    const ext = baseMimeType.includes("mp4") ? "mp4" : baseMimeType.includes("ogg") ? "ogg" : "webm";
    formData.append("file", blob, `voice-note.${ext}`);
    formData.append("durationSeconds", String(recordingSecondsRef.current));

    const res = await fetch(`/api/generic-matches/${matchId}/messages/audio`, { method: "POST", body: formData });
    setUploadingAudio(false);

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
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={listRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 p-4">
        {messages && messages.length === 0 && (
          <p className="text-sm text-muted text-center py-4">{t("chatEmpty")}</p>
        )}
        {hasMoreOlder && (
          <button
            type="button"
            onClick={loadOlder}
            disabled={loadingOlder}
            className={ui.buttonGhost + " text-xs mx-auto mb-2"}
          >
            {loadingOlder ? t("loadingMore") : t("loadEarlierMessages")}
          </button>
        )}
        {messages?.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] sm:max-w-md rounded-2xl text-sm ${m.audio_path ? "p-2" : "px-3.5 py-2"} ${
              m.sender_id === userId ? "self-end bg-primary text-white" : "self-start bg-surface-sunken text-ink"
            }`}
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
        ))}
      </div>

      {audioError && <p className="px-4 pt-2 text-xs text-danger">{audioError}</p>}
      {sendError && <p className="px-4 pt-2 text-xs text-danger">{sendError}</p>}

      <div className="flex items-center gap-2 p-3 border-t border-border shrink-0">
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
