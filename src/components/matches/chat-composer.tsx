"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { SendIcon, MicIcon, TrashIcon, PhotoIcon } from "@/components/nav-icons";
import { VOICE_NOTES_ENABLED, formatAudioDuration } from "@/lib/voice-notes";
import { ui } from "@/lib/ui";

// Up to about five lines, then the box scrolls.
const MAX_BOX_PX = 132;

function grow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MAX_BOX_PX)}px`;
}

function coarsePointer() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

/** The bar under a chat thread: type and send, send a photo, or record a voice note. */
export default function ChatComposer({
  compact,
  draft,
  onDraftChange,
  onSend,
  sending,
  uploading,
  recording,
  recordingSeconds,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  onPickPhoto,
  sendingPhoto,
}: {
  compact: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  uploading: boolean;
  recording: boolean;
  recordingSeconds: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  onPickPhoto: (file: File) => void;
  sendingPhoto: boolean;
}) {
  const t = useTranslations("Matches");
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  // Fit the box to its text whenever it changes from outside too (a saved
  // draft coming back, or cleared after sending).
  useEffect(() => {
    if (boxRef.current) grow(boxRef.current);
  }, [draft]);

  return (
    <div className={compact ? "flex items-end gap-2 p-2 border-t border-border" : "flex items-end gap-2 p-3 border-t border-border shrink-0"}>
      {recording ? (
        <>
          <button
            type="button"
            onClick={onCancelRecording}
            aria-label={t("cancelRecording")}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-danger-soft hover:text-danger"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
          <div className="flex-1 flex items-center gap-2 rounded-full bg-danger-soft px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-danger animate-pulse" />
            <span className="text-sm text-danger font-medium">{t("recording")}</span>
            <span className="text-sm text-danger/80 tabular-nums ms-auto">{formatAudioDuration(recordingSeconds)}</span>
          </div>
          <button
            type="button"
            onClick={onStopRecording}
            aria-label={t("sendRecording")}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition hover:bg-primary-hover"
          >
            <SendIcon className="h-5 w-5 rtl:scale-x-[-1]" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => photoInput.current?.click()}
            disabled={uploading || sendingPhoto}
            aria-label={sendingPhoto ? t("sendingPhoto") : t("sendPhoto")}
            title={t("sendPhoto")}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
          >
            {sendingPhoto ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <PhotoIcon className="h-6 w-6" />}
          </button>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onPickPhoto(file);
            }}
          />
          <textarea
            ref={boxRef}
            rows={1}
            dir="auto"
            className={ui.input + " flex-1 resize-none rounded-3xl py-2.5! leading-snug"}
            placeholder={t("chatPlaceholder")}
            aria-label={t("chatPlaceholder")}
            value={draft}
            disabled={uploading}
            onChange={(e) => {
              onDraftChange(e.target.value);
              grow(e.target);
            }}
            onKeyDown={(e) => {
              // On a computer Enter sends (Shift+Enter for a new line); on a
              // phone the return key makes a new line and the button sends.
              if (e.key === "Enter" && !e.shiftKey && !coarsePointer()) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          {draft.trim() || !VOICE_NOTES_ENABLED ? (
            <button
              type="button"
              onClick={onSend}
              disabled={sending}
              aria-label={t("chatSend")}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition hover:bg-primary-hover disabled:opacity-50"
            >
              <SendIcon className="h-5 w-5 rtl:scale-x-[-1]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartRecording}
              disabled={uploading}
              aria-label={t("recordVoiceNote")}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition hover:bg-primary-hover disabled:opacity-50"
            >
              <MicIcon className="h-5 w-5" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
