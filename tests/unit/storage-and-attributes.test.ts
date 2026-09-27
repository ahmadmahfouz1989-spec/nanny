import { describe, expect, it } from "vitest";
import { ownProfilePhotoObject, storageOwnPathFromPublicUrl } from "@/lib/storage-cleanup";
import { asAttributes } from "@/lib/attributes";

const BASE = "https://x.supabase.co/storage/v1/object/public";

describe("photo ownership", () => {
  it("finds a photo in any photo bucket, only in the owner's folder", () => {
    expect(ownProfilePhotoObject(`${BASE}/generic-photos/u1/a.jpg`, "u1")).toEqual({ bucket: "generic-photos", path: "u1/a.jpg" });
    expect(ownProfilePhotoObject(`${BASE}/nanny-photos/u1/a.jpg`, "u1")).toEqual({ bucket: "nanny-photos", path: "u1/a.jpg" });
    expect(ownProfilePhotoObject(`${BASE}/generic-photos/u2/a.jpg`, "u1")).toBeNull();
    expect(ownProfilePhotoObject("https://evil.example/u1/a.jpg", "u1")).toBeNull();
  });
  it("decodes the path", () => {
    expect(storageOwnPathFromPublicUrl(`${BASE}/voice-notes/u1/a%20b.webm`, "voice-notes", "u1")).toBe("u1/a b.webm");
  });
});

describe("asAttributes", () => {
  it("returns objects as-is and anything else as empty", () => {
    expect(asAttributes({ a: 1 })).toEqual({ a: 1 });
    expect(asAttributes(null)).toEqual({});
    expect(asAttributes([1, 2])).toEqual({});
    expect(asAttributes("text")).toEqual({});
  });
});
