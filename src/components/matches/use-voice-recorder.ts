"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MAX_RECORDING_SECONDS, pickAudioMimeType } from "@/lib/voice-notes";

export type RecordedVoiceNote = { blob: Blob; extension: "mp4" | "ogg" | "webm"; seconds: number };

/**
 * Records a voice note from the microphone. Hands the finished recording to
 * `onRecorded` (never a cancelled one) and stops everything if the
 * component unmounts mid-recording -- e.g. the user switches conversation.
 */
export function useVoiceRecorder(onRecorded: (note: RecordedVoiceNote) => void) {
  const t = useTranslations("Matches");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onRecordedRef = useRef(onRecorded);
  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // onstop is bound once, when recording starts, so it can't read the
  // elapsed time from state (it would always see 0) -- tracked here.
  const secondsRef = useRef(0);
  const cancelledRef = useRef(false);
  // getUserMedia's permission prompt can still be pending when the user
  // leaves; checked once it resolves so a late grant never starts a
  // recorder after the component is gone.
  const mountedRef = useRef(true);
  const requestingMicRef = useRef(false);

  useEffect(() => {
    // Reset here too, not just in useRef's initial value: Strict Mode's
    // dev-only effect replay runs the cleanup and then this setup again on
    // the same still-mounted component.
    mountedRef.current = true;
    cancelledRef.current = false;
    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  async function start() {
    setError(null);
    if (requestingMicRef.current) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError(t("micNotSupported"));
      return;
    }

    requestingMicRef.current = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      requestingMicRef.current = false;
      setError(t("micPermissionDenied"));
      return;
    }
    requestingMicRef.current = false;

    if (!mountedRef.current) {
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
      if (timerRef.current) clearInterval(timerRef.current);
      if (!cancelledRef.current) {
        // recorder.mimeType comes back with a codec suffix (e.g.
        // "audio/webm;codecs=opus") -- strip it so the Blob's type is
        // exactly one of the server's allowed types.
        const baseType = (recorder.mimeType || mimeType || "audio/webm").split(";")[0]!;
        const blob = new Blob(chunksRef.current, { type: baseType });
        if (blob.size > 0) {
          const extension = baseType.includes("mp4") ? "mp4" : baseType.includes("ogg") ? "ogg" : "webm";
          onRecordedRef.current({ blob, extension, seconds: secondsRef.current });
        }
      }
      setRecording(false);
      setSeconds(0);
    };

    recorder.start();
    setRecording(true);
    secondsRef.current = 0;
    setSeconds(0);
    timerRef.current = setInterval(() => {
      secondsRef.current += 1;
      if (secondsRef.current >= MAX_RECORDING_SECONDS) mediaRecorderRef.current?.stop();
      setSeconds(secondsRef.current);
    }, 1000);
  }

  /** Finish and hand over the recording. */
  function stop() {
    mediaRecorderRef.current?.stop();
  }

  /** Throw the recording away. */
  function cancel() {
    cancelledRef.current = true;
    mediaRecorderRef.current?.stop();
  }

  return { recording, seconds, error, start, stop, cancel };
}
