"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { SendIcon, MicIcon, TrashIcon } from "@/components/nav-icons";
import { MAX_RECORDING_SECONDS, pickAudioMimeType, formatAudioDuration } from "@/lib/voice-notes";

type Conversation = {
  matchId: string;
  counterpart: { id: string; name: string };
  lastMessage: { body: string; createdAt: string } | null;
  unreadCount: number;
};

type ThreadMessage = {
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
 * Deliberately simple v1: polling instead of realtime, no read-receipts UI
 * beyond the unread badge -- see the plan's messaging scope note.
 * ChatThread (used by the nanny messages page) is tightly coupled to the
 * `messages` table's realtime channel, so this stays a fresh, minimal
 * component rather than a generalization of it -- but the recording flow
 * itself reuses the same shared helpers/constants (@/lib/voice-notes) so
 * the two don't drift.
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
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

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
    if (!selected) return;
    const baseMimeType = mimeType.split(";")[0]!;
    const blob = new Blob(chunksRef.current, { type: baseMimeType });
    if (blob.size === 0) return;

    setUploadingAudio(true);
    const formData = new FormData();
    const ext = baseMimeType.includes("mp4") ? "mp4" : baseMimeType.includes("ogg") ? "ogg" : "webm";
    formData.append("file", blob, `voice-note.${ext}`);
    formData.append("durationSeconds", String(recordingSeconds));

    const res = await fetch(`/api/generic-matches/${selected}/messages/audio`, { method: "POST", body: formData });
    setUploadingAudio(false);

    if (!res.ok) {
      setAudioError(t("voiceNoteUploadError"));
      return;
    }

    loadThread(selected);
    loadConversations();
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
                  className={`max-w-[70%] rounded-2xl text-sm ${m.audio_path ? "p-2" : "px-4 py-2"} ${
                    m.sender_id === userId ? "self-end bg-primary text-white" : "self-start bg-surface-sunken"
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
              {messages?.length === 0 && <p className="text-sm text-muted">{t("chatEmpty")}</p>}
            </div>

            {audioError && <p className="px-4 pt-2 text-xs text-danger">{audioError}</p>}

            <div className="flex items-center gap-2 px-4 py-4 border-t border-border">
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
                    className={ui.input}
                    placeholder={t("chatPlaceholder")}
                    value={draft}
                    disabled={uploadingAudio}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                  />
                  {draft.trim() ? (
                    <button onClick={send} disabled={sending} className={ui.buttonPrimary + " px-4! py-2.5!"}>
                      <SendIcon className="h-4 w-4 rtl:scale-x-[-1]" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRecording}
                      disabled={uploadingAudio}
                      aria-label={t("recordVoiceNote")}
                      className={ui.buttonPrimary + " px-4! py-2.5! disabled:opacity-50"}
                    >
                      <MicIcon className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted">{tInbox("selectConversation")}</div>
        )}
      </div>
    </div>
  );
}
