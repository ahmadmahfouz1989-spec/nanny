"use client";

import { useEffect } from "react";
import { installReferrer } from "@/lib/native-app";
import { rememberInvite } from "@/lib/invite-capture";

const CHECKED_KEY = "ouiknow_install_referrer_checked";

/**
 * On the Android app's first launch, the invite code Google Play carried
 * through the install (ref=CODE on the Play Store link), kept for the
 * account about to be made. Asked once per install.
 */
export default function InviteCapture() {
  useEffect(() => {
    try {
      if (localStorage.getItem(CHECKED_KEY)) return;
    } catch {
      return;
    }
    void installReferrer().then((referrer) => {
      if (referrer === null && !navigator.userAgent.includes("ouiKnowApp")) return;
      try {
        localStorage.setItem(CHECKED_KEY, "1");
      } catch {}
      const code = referrer ? new URLSearchParams(referrer).get("ref")?.toUpperCase() : null;
      if (code && /^[A-Z0-9]{6,10}$/.test(code)) rememberInvite(code, "play_store");
    });
  }, []);
  return null;
}
