import { describe, expect, it } from "vitest";
import { callOutcome, formatCallLength, toCallEntry } from "@/lib/call-history";

describe("call history", () => {
  const row = { id: "c", match_id: "m", caller_id: "me", status: "ended", created_at: "2026-11-19T10:00:00Z", answered_at: null, ended_at: null };

  it("tells each side how a call went", () => {
    expect(callOutcome({ outgoing: false, status: "missed", seconds: null })).toBe("missed");
    expect(callOutcome({ outgoing: true, status: "missed", seconds: null })).toBe("noAnswer");
    expect(callOutcome({ outgoing: false, status: "busy", seconds: null })).toBe("missed");
    expect(callOutcome({ outgoing: true, status: "busy", seconds: null })).toBe("busy");
    expect(callOutcome({ outgoing: true, status: "declined", seconds: null })).toBe("declined");
    expect(callOutcome({ outgoing: false, status: "declined", seconds: null })).toBe("declinedByYou");
    expect(callOutcome({ outgoing: true, status: "ringing", seconds: null })).toBe("ongoing");
    // A dropped call you talked on is still a call you had.
    expect(callOutcome({ outgoing: true, status: "failed", seconds: 75 })).toBe("talked");
  });

  it("works out the length and the direction", () => {
    const answered = toCallEntry({ ...row, answered_at: "2026-11-19T10:00:05Z", ended_at: "2026-11-19T10:04:10Z" }, "me");
    expect(answered).toMatchObject({ outgoing: true, seconds: 245 });
    expect(toCallEntry(row, "someone else").outgoing).toBe(false);
    expect(toCallEntry(row, "me").seconds).toBeNull();
  });

  it("formats call lengths", () => {
    expect(formatCallLength(5)).toBe("0:05");
    expect(formatCallLength(245)).toBe("4:05");
    expect(formatCallLength(3730)).toBe("1:02:10");
  });
});
