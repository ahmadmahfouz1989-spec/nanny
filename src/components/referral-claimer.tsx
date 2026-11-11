"use client";

import { useEffect } from "react";
import { forgetInvite, storedInvite } from "@/lib/invite-capture";

/**
 * Right after signing up (any way: email, Google, Apple, WhatsApp), attaches
 * the invite this device arrived with -- an invite link or Google Play's
 * install referrer -- to the new account. Rendered only once Points are
 * released. The server decides: only new accounts, once, never your own.
 */
export default function ReferralClaimer() {
  useEffect(() => {
    const invite = storedInvite();
    if (!invite) return;
    fetch("/api/referrals/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: invite.code, source: invite.source }),
    })
      .then((r) => r.json())
      .then((body: { result?: string }) => {
        // Settled one way or the other; keep it only while invites are off.
        if (body.result && body.result !== "off") forgetInvite();
      })
      .catch(() => {});
  }, []);
  return null;
}
