"use client";

import { useTranslations } from "next-intl";
import { useCall } from "@/components/calls/call-provider";
import { PhoneIcon } from "@/components/calls/phone-icon";

/**
 * Calls the other person in a conversation, in the app. The server only
 * lets it through once the two have talked (a message, or an order); the
 * call screen says so otherwise.
 */
export default function CallButton({
  matchId,
  name,
  photoUrl,
  variant = "icon",
}: {
  matchId: string;
  name: string;
  photoUrl: string | null;
  variant?: "icon" | "button";
}) {
  const t = useTranslations("Calls");
  const call = useCall();
  if (!call) return null;

  const start = () => call.startCall(matchId, { name, photoUrl });

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={start}
        disabled={call.inCall}
        aria-label={t("callName", { name })}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-sm font-medium transition hover:bg-surface-sunken disabled:opacity-50"
      >
        <PhoneIcon className="h-4 w-4" />
        {t("call")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={call.inCall}
      aria-label={t("callName", { name })}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
    >
      <PhoneIcon className="h-5 w-5" />
    </button>
  );
}
