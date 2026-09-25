import { z } from "zod";

const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Za-z]/, "Password must include a letter")
  .regex(/[0-9]/, "Password must include a number");

// Role is no longer chosen at signup -- an account can hold a profile per
// category (see generic_profiles), so committing to a role up front no
// longer makes sense for any category. Every account lands on /categories
// after confirming and picks a category, then a role, from there.
export const signupSchema = z.object({
  email: z.string().email(),
  password,
  preferredLanguage: z.enum(["en", "ar", "fr"]).default("en"),
});

export type SignupInput = z.infer<typeof signupSchema>;

