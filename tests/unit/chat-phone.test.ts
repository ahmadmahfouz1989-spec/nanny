import { describe, expect, it } from "vitest";
import { containsPhoneNumber } from "@/lib/content-filter";

// Phone numbers can't be passed in chat, however they're written; ordinary
// talk about times, prices, ages and days still goes through.

describe("phone numbers in chat", () => {
  it.each([
    "call me on 03 123 456",
    "+961 71 234 567",
    "00961 3 123456",
    "03-612-985",
    "70.12.34.56",
    "٠٣ ١٢٣ ٤٥٦",
    "rakame 03*612*985",
    "O3 612 985",
    "7O 123 456",
    "zero three six one two nine eight five",
    "صفر تلاتة ستة واحد اتنين تسعة تمانية خمسة",
    "sefer tlete set wa7ad tnen tes3a tmene 5amse",
    "01 345 678",
  ])("blocks %s", (text) => {
    expect(containsPhoneNumber(text)).toBe(true);
  });

  it.each([
    "Can you come Monday at 8:30?",
    "I have 2 kids, 3 and 5 years old",
    "My budget is 1,500,000 LBP a month",
    "$20 an hour is fine",
    "Starting 2026-11-10",
    "Do you have WhatsApp?",
    "one or two days a week",
    "I'm at building 12, floor 3",
  ])("allows %s", (text) => {
    expect(containsPhoneNumber(text)).toBe(false);
  });

  it("catches a number split over two messages", () => {
    expect(containsPhoneNumber("985", "03 612")).toBe(true);
    expect(containsPhoneNumber("456", "+961 71 234")).toBe(true);
  });

  it("but not two unrelated numbers in a row", () => {
    expect(containsPhoneNumber("2000", "1500")).toBe(false);
    expect(containsPhoneNumber("ok see you at 5", "03 612")).toBe(false);
  });
});
