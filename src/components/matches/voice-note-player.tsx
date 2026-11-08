"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatAudioDuration } from "@/lib/voice-notes";

type State = "idle" | "loading" | "playing" | "paused" | "error";

// A file a phone can't read can keep it "loading" forever without an error event.
const GIVE_UP_AFTER_MS = 20_000;

// One voice note at a time, like every chat app.
let current: HTMLAudioElement | null = null;

/**
 * The chat's own player: iPhone's built-in one barely fits a bubble and only
 * shows a spinner when a file won't play. Nothing downloads until play is
 * tapped, and the length comes from the message, since recordings often
 * don't state their own.
 */
export default function VoiceNotePlayer({ src, durationSeconds, own }: { src: string; durationSeconds: number | null; own: boolean }) {
  const t = useTranslations("Matches");
  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<State>("idle");
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(durationSeconds ?? 0);

  function stopTimer() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function startTimer() {
    stopTimer();
    timerRef.current = setTimeout(() => {
      audioRef.current?.pause();
      setState("error");
    }, GIVE_UP_AFTER_MS);
  }

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      stopTimer();
      audio?.pause();
      if (current === audio) current = null;
    };
  }, []);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (state === "playing" || state === "loading") {
      stopTimer();
      audio.pause();
      setState("paused");
      return;
    }
    if (current && current !== audio) current.pause();
    current = audio;
    if (state === "error") audio.load();
    setState("loading");
    startTimer();
    try {
      await audio.play();
    } catch (e) {
      // Tapping pause while it's still loading rejects too: that isn't a failure.
      if ((e as Error).name === "AbortError") return;
      stopTimer();
      setState("error");
    }
  }

  const playing = state === "playing";
  const progress = length > 0 ? Math.min(100, (position / length) * 100) : 0;
  const shownSeconds = playing || state === "paused" ? position : length;

  return (
    <div dir="ltr" className="flex w-52 max-w-full items-center gap-2.5 py-0.5 pe-1.5">
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlaying={() => {
          stopTimer();
          setState("playing");
        }}
        onWaiting={() => {
          setState("loading");
          startTimer();
        }}
        onPause={(e) => {
          stopTimer();
          if (!e.currentTarget.ended) setState((s) => (s === "playing" ? "paused" : s));
        }}
        onEnded={(e) => {
          stopTimer();
          e.currentTarget.currentTime = 0;
          setPosition(0);
          setState("idle");
        }}
        onError={() => {
          stopTimer();
          setState("error");
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setLength(d);
        }}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing || state === "loading" ? t("voicePause") : t("voicePlay")}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
          own ? "bg-white/25 text-on-primary" : "bg-primary text-on-primary"
        }`}
      >
        {state === "loading" ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
            <rect x="2.5" y="1.5" width="3.2" height="11" rx="1" />
            <rect x="8.3" y="1.5" width="3.2" height="11" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
            <path d="M3.5 1.9c0-.8.9-1.3 1.6-.9l7.2 4.6c.6.4.6 1.3 0 1.7L5.1 12c-.7.4-1.6-.1-1.6-.9V1.9Z" />
          </svg>
        )}
      </button>
      {state === "error" ? (
        <span className="min-w-0 flex-1 text-xs leading-snug opacity-90">{t("voiceUnplayable")}</span>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className={`h-1 overflow-hidden rounded-full ${own ? "bg-white/30" : "bg-ink/15"}`}>
            <div className={`h-full rounded-full ${own ? "bg-white" : "bg-primary"}`} style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[11px] tabular-nums opacity-80">{shownSeconds > 0 || playing ? formatAudioDuration(shownSeconds) : t("voiceNote")}</span>
        </div>
      )}
    </div>
  );
}
