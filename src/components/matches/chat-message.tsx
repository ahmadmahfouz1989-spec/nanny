"use client";

import { useState } from "react";
import VoiceNotePlayer from "./voice-note-player";
import { useTranslations } from "next-intl";

export type ChatMessageData = {
  id: string;
  sender_id: string;
  body: string;
  audio_path: string | null;
  audio_duration_seconds: number | null;
  audioUrl?: string | null;
  image_path?: string | null;
  imageUrl?: string | null;
  created_at: string;
  /** Null until the other person has seen it. */
  read_at?: string | null;
  /** Null until it reached the other person's app or website. */
  delivered_at?: string | null;
};

/** One message bubble, optionally preceded by a day divider and followed by its time. */
export default function ChatMessage({
  message: m,
  own,
  dayLabel,
  time,
}: {
  message: ChatMessageData;
  own: boolean;
  dayLabel?: string;
  time?: string;
}) {
  const t = useTranslations("Matches");
  const [viewing, setViewing] = useState(false);

  return (
    <div className="flex flex-col">
      {dayLabel && (
        <p className="text-center text-[11px] font-medium text-muted my-3 first:mt-0">
          {dayLabel}
        </p>
      )}
      <div
        dir="auto"
        className={`max-w-[85%] sm:max-w-md rounded-2xl text-sm ${
          m.audio_path ? "p-2" : m.image_path ? "p-1" : "px-3.5 py-2"
        } ${own ? "self-end bg-primary text-on-primary" : "self-start bg-surface-sunken text-ink"}`}
      >
        {m.image_path ? (
          m.imageUrl ? (
            <button type="button" onClick={() => setViewing(true)} aria-label={t("photoOpen")} className="block overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.imageUrl} alt="" loading="lazy" className="max-h-72 w-auto max-w-full object-cover" />
            </button>
          ) : (
            <span className="block px-2.5 py-1.5 text-xs opacity-80">{t("photoLoading")}</span>
          )
        ) : m.audio_path ? (
          m.audioUrl ? (
            <VoiceNotePlayer src={m.audioUrl} durationSeconds={m.audio_duration_seconds} own={own} />
          ) : (
            <span className="text-xs opacity-80 px-1.5">{t("voiceNoteLoading")}</span>
          )
        ) : (
          // Either language can appear in either UI -- let the text pick
          // its own direction so brackets and punctuation land right.
          <span dir="auto" className="whitespace-pre-wrap">{m.body}</span>
        )}
      </div>
      {viewing && m.imageUrl && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4 pt-[max(1rem,env(safe-area-inset-top))]" onClick={() => setViewing(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.imageUrl} alt="" className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            onClick={() => setViewing(false)}
            className="absolute end-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white"
          >
            {t("photoClose")}
          </button>
        </div>
      )}
      {time && (
        <span className={`mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted ${own ? "self-end" : "self-start"}`}>
          {time}
          {own && <Ticks message={m} />}
        </span>
      )}
    </div>
  );
}

/**
 * WhatsApp's ticks on your own message: one when it's sent, two grey once
 * it reached their app or website, two blue once they've read it.
 */
function Ticks({ message: m }: { message: ChatMessageData }) {
  const t = useTranslations("Matches");
  const state = m.read_at ? "read" : m.delivered_at ? "delivered" : "sent";
  return (
    <span role="img" aria-label={t(`receipt_${state}`)} title={t(`receipt_${state}`)} className={state === "read" ? "text-read-tick" : "text-muted"}>
      {state === "sent" ? (
        <svg viewBox="0 0 16 11" className="h-[11px] w-[14px]" fill="none" aria-hidden>
          <path d="M1.5 6l3.2 3.2L11 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 11" className="h-[11px] w-[18px]" fill="none" aria-hidden>
          <path d="M1.5 6l3.2 3.2L11 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8.2 8.4l0.8 0.8L15.3 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}
