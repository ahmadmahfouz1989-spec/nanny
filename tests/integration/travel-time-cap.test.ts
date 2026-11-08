import { afterAll, describe, expect, it } from "vitest";
import { admin } from "./helpers";

// The daily cap on Google road-time lookups is kept in the database:
// bookings succeed until the day's total would pass the limit.

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());

describe("road-time daily cap", () => {
  afterAll(async () => {
    await admin.from("travel_time_usage").delete().eq("day", today());
  });

  it("books up to the limit and refuses past it", async () => {
    await admin.from("travel_time_usage").delete().eq("day", today());
    const book = async (n: number, limit = 10) => (await admin.rpc("use_travel_time", { p_elements: n, p_limit: limit })).data;
    expect(await book(6)).toBe(true);
    expect(await book(4)).toBe(true);
    expect(await book(1)).toBe(false);
    expect(await book(3, 0)).toBe(false);
    const { data } = await admin.from("travel_time_usage").select("elements").eq("day", today()).single();
    expect(data!.elements).toBe(10);
  });

  it("isn't callable by signed-in users", async () => {
    const { createUser } = await import("./helpers");
    const u = await createUser("cap-user");
    const { error } = await u.client.rpc("use_travel_time", { p_elements: 1, p_limit: 100 });
    expect(error).not.toBeNull();
    const { cleanupUsers } = await import("./helpers");
    await cleanupUsers();
  });
});
