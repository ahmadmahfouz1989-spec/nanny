import { describe, expect, it } from "vitest";
import { containsContactInfo } from "@/lib/content-filter";

describe("containsContactInfo: phone numbers", () => {
  it.each([
    "03 123456",
    "+961 3 123456",
    "71-234-567",
    "call 03612985",
    // Seen in the feed, 2026-11-02:
    "03&612&985",
    "03*612*985",
    "03 & 612 & 985",
    "0 3 6 1 2 9 8 5",
    "03 / 612 / 985",
    "03_612_985",
    "03...612...985",
    "3 612 985",
    "71,234,567",
    "03,612,985",
    "٠٣٦١٢٩٨٥",
    "۰۳ ۶۱۲ ۹۸۵",
    "رقمي ٧١٢٣٤٥٦٧",
  ])("rejects %j", (text) => {
    expect(containsContactInfo(text)).toBe(true);
  });

  it.each([
    "Deleveri la kel trablos soper market mat3am saydaliye mostanadet kelchi bechte8l mn 8 lsoboh lal 10 lmasa w as3ar 7elwe",
    "Delivery da7ye wbyrout men 8 msa2an 7ata 2 belel",
    "Nhar sabet dlvery MN beirut la trablos",
    "2 kids, ages 3 and 5, 21 days a month",
    "Starting 2026-10-01, three times a week",
    "on 01.10.2026 or 10/01/2026",
    "open 8:00-22:00 every day",
    "from 8h30 to 17h00",
    "1,500,000 LBP per month",
    "2.000.000 L.L. a week",
    "500 000 ل.ل",
    "$1,200 a month",
    "budget 300 usd",
  ])("allows %j", (text) => {
    expect(containsContactInfo(text)).toBe(false);
  });
});

describe("containsContactInfo: other contact details", () => {
  it.each(["mail me at rana@example.com", "whatsapp me", "wa.me/96103612985", "follow @rana_helps"])("rejects %j", (text) => {
    expect(containsContactInfo(text)).toBe(true);
  });
});
