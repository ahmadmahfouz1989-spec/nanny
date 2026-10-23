import { describe, expect, it } from "vitest";
import { signupConfirmationEmail } from "@/lib/email";

describe("sign-up confirmation email", () => {
  it("carries the code to type in the app, and the link", () => {
    const { subject, html } = signupConfirmationEmail("en", "https://oui-know.com/auth/confirm?x=1", "482913");
    expect(subject).toContain("482913");
    expect(html).toContain("482913");
    expect(html).toContain("https://oui-know.com/auth/confirm?x=1");
  });

  it("puts nothing but digits where the code goes", () => {
    const { subject, html } = signupConfirmationEmail("en", "https://oui-know.com/c", "<b>x</b>");
    expect(html).not.toContain("<b>x</b>");
    expect(subject).toBe("Confirm your email");
  });

  it("still works without a code (link only)", () => {
    expect(signupConfirmationEmail("ar", "https://oui-know.com/c").html).toContain("https://oui-know.com/c");
  });
});
