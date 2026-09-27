"use client";

import { useTranslations } from "next-intl";

export type ChatMessageData = {
  id: string;
  sender_id: string;
  body: string;
  audio_path: string | null;
  audio_duration_seconds: number | null;
  audioUrl?: string | null;
  created_at: string;
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
      {time && (
        <span className={`text-[11px] text-muted mt-0.5 ${own ? "self-end" : "self-start"}`}>
          {time}
        </span>
      )}
    </div>
  );
}
