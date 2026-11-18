import { describe, expect, it } from "vitest";
import { isPhoneNumber, westernDigits } from "@/lib/phone-format";

describe("phone numbers as people type them", () => {
  it("accepts the usual ways, Arabic digits included", () => {
    for (const v of ["03 123 456", "03/123456", "+961 3-123.456", "٠٣١٢٣٤٥٦", "۰۳۱۲۳۴۵۶", "(01) 234567"]) expect(isPhoneNumber(v)).toBe(true);
  });
  it("refuses what isn't a number", () => {
    for (const v of ["", "12345", "call me", "03 123 456 ext 2", "1234567890123456"]) expect(isPhoneNumber(v)).toBe(false);
  });
  it("stores Western digits", () => {
    expect(westernDigits("٠٣ ١٢٣ ٤٥٦")).toBe("03 123 456");
  });
});
