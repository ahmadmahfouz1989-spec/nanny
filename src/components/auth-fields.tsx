"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";

/** Email with a visible label and the phone's email autofill. */
export function EmailField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("Auth");
  return (
    <label className="flex flex-col gap-1.5">
      <span className={ui.label}>{t("emailLabel")}</span>
      <input
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        dir="ltr"
        placeholder={t("emailPlaceholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={ui.input}
      />
    </label>
  );
}

/**
 * Password with a visible label, show/hide, and the right autofill: a
 * saved one when logging in, a suggested strong one when signing up --
 * where the rules are shown up front rather than after a failed try.
 */
export function PasswordField({ value, onChange, isNew = false }: { value: string; onChange: (v: string) => void; isNew?: boolean }) {
  const t = useTranslations("Auth");
  const [shown, setShown] = useState(false);
  return (
    <label className="flex flex-col gap-1.5">
      <span className={ui.label}>{t("passwordLabel")}</span>
      <span className="relative">
        <input
          type={shown ? "text" : "password"}
          required
          autoComplete={isNew ? "new-password" : "current-password"}
          minLength={isNew ? 8 : undefined}
          dir="ltr"
          placeholder={t("passwordPlaceholder")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={ui.input + " pe-20!"}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          className="absolute inset-y-0 end-0 flex min-w-16 items-center justify-center px-3 text-sm font-medium text-primary"
        >
          {shown ? t("hidePassword") : t("showPassword")}
        </button>
      </span>
      {isNew && <span className="text-xs text-muted">{t("passwordRules")}</span>}
    </label>
  );
}
