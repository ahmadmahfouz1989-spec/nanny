"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { nativeCalls } from "@/lib/native-app";
import { ui } from "@/lib/ui";

/**
 * Android 14+ in the app: whether an incoming call takes over the screen
 * (like a phone call) or only rings as a banner. Google Play doesn't turn it
 * on for apps that aren't mainly for calling, so the person can here, in the
 * phone's own settings. Hidden everywhere else.
 */
export default function FullScreenCallsCard() {
  const t = useTranslations("Calls");
  const [state, setState] = useState<{ allowed: boolean } | null>(null);

  useEffect(() => {
    const plugin = nativeCalls();
    if (!plugin?.fullScreenCalls) return;
    const check = () =>
      plugin.fullScreenCalls!()
        .then((r) => setState(r.needsPermission ? { allowed: r.allowed } : null))
        .catch(() => setState(null));
    void check();
    // Back from the phone's settings: show what they chose.
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  if (!state) return null;

  return (
    <div className={ui.card + " p-6 mb-5"}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-ink">{t("fullScreenTitle")}</p>
          <p className="mt-1 text-sm text-muted">{state.allowed ? t("fullScreenOn") : t("fullScreenOff")}</p>
        </div>
        <button type="button" onClick={() => void nativeCalls()?.openFullScreenCallsSettings?.()} className={(state.allowed ? ui.buttonSecondary : ui.buttonPrimary) + " shrink-0"}>
          {state.allowed ? t("fullScreenChange") : t("fullScreenTurnOn")}
        </button>
      </div>
    </div>
  );
}
