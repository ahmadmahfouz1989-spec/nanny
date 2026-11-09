import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTrackingToken, readTrackingToken } from "@/lib/tracking-token";

// The key the apps use to send a delivery's location from the background:
// only for that order and rider, only for a few hours, not forgeable.

describe("tracking key", () => {
  afterEach(() => vi.useRealTimers());
  const order = "11111111-1111-1111-1111-111111111111";
  const rider = "22222222-2222-2222-2222-222222222222";

  it("reads back as the rider, for its own order", () => {
    const { token } = makeTrackingToken(order, rider);
    expect(readTrackingToken(token, order)).toBe(rider);
  });

  it("isn't valid for another order", () => {
    const { token } = makeTrackingToken(order, rider);
    expect(readTrackingToken(token, "33333333-3333-3333-3333-333333333333")).toBeNull();
  });

  it("can't be changed to another rider or a later expiry", () => {
    const { token } = makeTrackingToken(order, rider);
    const [, exp, mac] = token.split(".");
    expect(readTrackingToken(`44444444-4444-4444-4444-444444444444.${exp}.${mac}`, order)).toBeNull();
    expect(readTrackingToken(`${rider}.${Number(exp) + 86_400_000}.${mac}`, order)).toBeNull();
    expect(readTrackingToken("garbage", order)).toBeNull();
  });

  it("expires after six hours", () => {
    vi.useFakeTimers();
    const { token } = makeTrackingToken(order, rider);
    vi.advanceTimersByTime(6 * 60 * 60_000 + 1000);
    expect(readTrackingToken(token, order)).toBeNull();
  });
});
