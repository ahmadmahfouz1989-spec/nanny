"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";

/**
 * "Message <name>" on a provider's profile for someone with no request in
 * that service yet: opens the conversation straight away (a short request
 * is made for them -- lib/direct-contact.ts), asking only for their name
 * when we don't have it. `autoStart`: arriving back from sign-up on a
 * shared link (?contact=1), so the tap they already made isn't asked again.
 */
export default function MessageNowButton({ providerProfileId, name, autoStart = false }: { providerProfileId: string; name: string; autoStart?: boolean }) {
  const t = useTranslations("MessageNow");
  const router = useRouter();
  const [askName, setAskName] = useState(false);
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function start(withName?: string) {
    setBusy(true);
    setError(null);
    const res = await request("/api/generic-matches/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerProfileId, fullName: withName }),
    });
    const body = await res?.json().catch(() => null);
    setBusy(false);
    if (res?.ok && typeof body?.matchId === "string") {
      router.push(`/messages?match=${body.matchId}`);
      return;
    }
    if (body?.code === "name_required") {
      setAskName(true);
      return;
    }
    setError(typeof body?.error === "string" ? body.error : t("error"));
  }

  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    void Promise.resolve().then(() => start());
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (askName) {
    return (
      <form
        className="flex w-full flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void start(fullName);
        }}
      >
        <label className="flex flex-col gap-1">
          <span className={ui.label}>{t("yourName")}</span>
          <input className={ui.input} maxLength={80} autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy || fullName.trim().length < 2} className={ui.buttonPrimary}>
          {t("message", { name })}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" disabled={busy} className={ui.buttonPrimary} onClick={() => start()}>
        {busy ? t("opening") : t("message", { name })}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
