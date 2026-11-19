"use client";

import { useTranslations } from "next-intl";
import { useCall } from "@/components/calls/call-provider";
import { CallArrow } from "@/components/calls/call-log";
import { callOutcome, formatCallLength, type CallEntry } from "@/lib/call-history";

/**
 * A call, as a line between the messages: "Missed voice call · 3:42 PM ·
 * Call back", "Voice call · 4:05".
 */
export default function ChatCallLine({
  call,
  matchId,
  counterpart,
  dayLabel,
  time,
}: {
  call: CallEntry;
  matchId: string;
  counterpart?: { name: string; photoUrl: string | null };
  dayLabel?: string;
  time?: string;
}) {
  const t = useTranslations("Calls");
  const calls = useCall();
  const outcome = callOutcome(call);
  const missed = outcome === "missed";
  const label =
    outcome === "talked"
      ? `${t("log.voiceCall")} · ${formatCallLength(call.seconds ?? 0)}`
      : outcome === "missed"
        ? t("log.missed")
        : t(`log.${outcome}`);
  // Didn't talk: one tap to try again.
  const again = outcome !== "talked" && outcome !== "ongoing" && outcome !== "declinedByYou";

  return (
    <div className="flex flex-col">
      {dayLabel && <p className="text-center text-[11px] font-medium text-muted my-3 first:mt-0">{dayLabel}</p>}
      <div
        className={`my-1 flex max-w-full items-center gap-1.5 self-center rounded-full px-3 py-1.5 text-xs ${
          missed ? "bg-danger/10 text-danger" : "bg-surface-sunken text-muted"
        }`}
      >
        <CallArrow outgoing={call.outgoing} />
        <span className="truncate font-medium">{label}</span>
        {time && <span className="shrink-0 opacity-80">· {time}</span>}
        {again && calls && counterpart && (
          <button
            type="button"
            onClick={() => calls.startCall(matchId, counterpart)}
            disabled={calls.inCall}
            className="ms-1 shrink-0 font-semibold text-primary underline-offset-2 hover:underline disabled:opacity-50"
          >
            {call.outgoing ? t("callAgain") : t("callBack")}
          </button>
        )}
      </div>
    </div>
  );
}
