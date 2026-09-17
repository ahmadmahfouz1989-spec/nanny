import { z } from "zod";

const lebanesePhone = /^\+961\d{7,8}$/;
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Za-z]/, "Password must include a letter")
  .regex(/[0-9]/, "Password must include a number");

// Role is no longer chosen at signup -- an account can hold a profile per
// category (see generic_profiles), so committing to "parent" or "nanny"
// up front no longer makes sense. It's optional here only so the existing
// nanny-category signup/login screens keep working unchanged; omitting it
// leaves users.role null until the account picks a category.
export const signupSchema = z.object({
  role: z.enum(["parent", "nanny"]).optional(),
  email: z.string().email(),
  password,
  preferredLanguage: z.enum(["en", "ar", "fr"]).default("en"),
  // Where to land after email confirmation, for entry points other than
  // the nanny/parent flow (e.g. a category's own onboarding). Must be a
  // same-site relative path -- never an absolute/protocol-relative URL --
  // since this ends up in the Supabase confirmation email's redirect link.
  next: z
    .string()
    .max(200)
    .regex(/^\/(?!\/)\S*$/)
    .optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().regex(lebanesePhone).optional(),
    password: z.string().min(1, "Password is required"),
  })
  .refine((data) => data.email || data.phone, {
    message: "Either email or phone is required",
    path: ["email"],
  });

export type LoginInput = z.infer<typeof loginSchema>;

export const verifyPhoneConfirmSchema = z.object({
  code: z.string().min(4).max(10),
});
