"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
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
  const [userId, setUserId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const onMessageRef = useRef(onMessage);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
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

  function refreshMessages() {
    fetch(`/api/matches/${matchId}/messages`)
      .then((res) => res.json())
      .then((body) => setMessages(body.messages ?? []));
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));

    refreshMessages();

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
          if (variant === "full") {
            fetch(`/api/matches/${matchId}/messages/read`, { method: "PATCH" });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, variant]);

  useEffect(() => {
    // Scroll only this thread's own container to the bottom — never
    // scrollIntoView, which would also scroll the page (the compact widget
    // is embedded mid-page on the dashboard).
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
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
    setRecordingSeconds(0);
    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((s) => {
        if (s + 1 >= MAX_RECORDING_SECONDS) {
          mediaRecorderRef.current?.stop();
        }
        return s + 1;
      });
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
    formData.append("durationSeconds", String(recordingSeconds));

    const res = await fetch(`/api/matches/${matchId}/messages/audio`, { method: "POST", body: formData });
    setUploadingAudio(false);

    if (!res.ok) {
      setAudioError(t("voiceNoteUploadError"));
      return;
    }

    const { message } = await res.json();
    setMessages((prev) => {
      const withoutOptimistic = prev ?? [];
      if (withoutOptimistic.some((m) => m.id === message.id)) return withoutOptimistic;
      return [...withoutOptimistic, message];
    });
    onMessageRef.current?.(message);
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
