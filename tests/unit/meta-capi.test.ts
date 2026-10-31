import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashedUserData, readQueue } from "@/lib/meta-capi";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

describe("hashedUserData", () => {
  it("normalises before hashing, the way Meta matches", () => {
    const data = hashedUserData({ id: "u1", email: "  Rana@Example.COM ", phone: "03 123 456", fullName: "Rana  Abi Nader" });
    expect(data.em).toEqual([sha("rana@example.com")]);
    expect(data.ph).toEqual([sha("9613123456")]);
    expect(data.fn).toEqual([sha("rana")]);
    expect(data.ln).toEqual([sha("abi nader")]);
    expect(data.external_id).toEqual([sha("u1")]);
  });

  it("takes international numbers as they are, including Supabase's bare digits", () => {
    expect(hashedUserData({ phone: "+971 50 123 4567" }).ph).toEqual([sha("971501234567")]);
    expect(hashedUserData({ phone: "96170123456" }).ph).toEqual([sha("96170123456")]);
  });

  it("leaves out what it doesn't have", () => {
    expect(hashedUserData({ email: null, phone: "12" })).toEqual({});
    expect(hashedUserData(null)).toEqual({});
  });
});

describe("readQueue", () => {
  it("reads what the server queued and ignores anything else", () => {
    const queued = [{ n: "Lead", id: "abc12345", p: { content_category: "nanny" } }];
    expect(readQueue(Buffer.from(JSON.stringify(queued)).toString("base64url"))).toEqual(queued);
    expect(readQueue("not-json")).toEqual([]);
    expect(readQueue(undefined)).toEqual([]);
  });
});
