// Shared between the nanny/parent and generic-category voice-note paths --
// both record into the same `voice-notes` storage bucket and the same
// client-side recording UI, so these constants and pure helpers live in
// one place rather than drifting between two copies.

export const MAX_RECORDING_SECONDS = 120;
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg"];
export const AUDIO_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
export const SIGNED_URL_TTL_SECONDS = 3600;

// A voice note still needs *something* in the not-null, 1-2000-char body
// column -- kept as a plain, unlocalized fallback for any code path that
// only ever reads .body (the new-message email snippet, for instance),
// not shown to a viewer whose client understands audio_path.
export const VOICE_NOTE_PLACEHOLDER_BODY = "🎤 Voice note";

export function pickAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return AUDIO_MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
}

export function formatAudioDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
