import { describe, expect, it } from "vitest";
import { minutesByDistance, orderEta, PICKUP_STOP_MINUTES } from "@/lib/order-eta";

// No GOOGLE_MAPS_SERVER_KEY in tests: every time comes from distance, and the db is never touched.
const db = {} as never;
const pickup = { lat: 33.8938, lng: 35.5018 }; // Hamra
const dropoff = { lat: 33.8886, lng: 35.5157 }; // ~1.4 km east
const base = { orderId: "o1", pickup, dropoff, rider: null, offeredMinutes: null, confirmedAt: null, pickedUpAt: null };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

describe("orderEta", () => {
  it("is nothing outside a delivery in progress", async () => {
    expect(await orderEta(db, { ...base, status: "open" })).toBeNull();
    expect(await orderEta(db, { ...base, status: "delivered" })).toBeNull();
  });

  it("counts from the rider's live position: pickup, then the stop, then the drop-off", async () => {
    const rider = { lat: 33.9038, lng: 35.5018 }; // ~1.1 km north of the pickup
    const eta = await orderEta(db, { ...base, status: "on_the_way", rider });
    const toPickup = minutesByDistance(rider, pickup);
    expect(eta).toEqual({ pickupMinutes: toPickup, dropoffMinutes: toPickup + PICKUP_STOP_MINUTES + minutesByDistance(pickup, dropoff), basis: "live" });
  });

  it("after the pickup, only the drop-off", async () => {
    const eta = await orderEta(db, { ...base, status: "picked_up", rider: pickup });
    expect(eta).toEqual({ pickupMinutes: null, dropoffMinutes: minutesByDistance(pickup, dropoff), basis: "live" });
  });

  it("without a position, counts down the time the rider gave", async () => {
    const eta = await orderEta(db, { ...base, status: "accepted", offeredMinutes: 20, confirmedAt: ago(5) });
    expect(eta?.pickupMinutes).toBe(15);
    expect(eta?.basis).toBe("offer");
  });

  it("says nothing once the rider's time has passed with no position", async () => {
    expect(await orderEta(db, { ...base, status: "on_the_way", offeredMinutes: 10, confirmedAt: ago(12) })).toBeNull();
  });

  it("is 0 when right there", () => {
    expect(minutesByDistance(pickup, pickup)).toBe(0);
  });
});
