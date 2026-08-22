import { z } from "zod";

const lebanesePhone = /^\+961\d{7,8}$/;
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Za-z]/, "Password must include a letter")
  .regex(/[0-9]/, "Password must include a number");

export const signupSchema = z
  .object({
    role: z.enum(["parent", "nanny"]),
    email: z.string().email().optional(),
    phone: z.string().regex(lebanesePhone, "Use E.164 format, e.g. +9613123456").optional(),
    password,
    preferredLanguage: z.enum(["en", "ar", "fr"]).default("en"),
  })
  .refine((data) => data.email || data.phone, {
    message: "Either email or phone is required",
    path: ["email"],
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
