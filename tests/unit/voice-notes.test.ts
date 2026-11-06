import { afterEach, describe, expect, it, vi } from "vitest";
import { pickAudioMimeType } from "@/lib/voice-notes";

describe("recording format", () => {
  afterEach(() => vi.unstubAllGlobals());
  const supports = (...types: string[]) => vi.stubGlobal("MediaRecorder", { isTypeSupported: (t: string) => types.includes(t) });

  it("records MP4 when the phone can, even if it can also record WebM", () => {
    supports("audio/webm;codecs=opus", "audio/webm", "audio/mp4");
    expect(pickAudioMimeType()).toBe("audio/mp4");
  });

  it("falls back to WebM on phones that can't record MP4", () => {
    supports("audio/webm;codecs=opus", "audio/webm");
    expect(pickAudioMimeType()).toBe("audio/webm;codecs=opus");
  });
});
