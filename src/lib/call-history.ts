/**
 * A call as one side of it sees it, for the Calls tab, the lines in a
 * chat and the chat list's preview. Shared by server and client.
 */
export type CallEntry = {
  id: string;
  matchId: string;
  /** You called them. */
  outgoing: boolean;
  status: string;
  createdAt: string;
  /** How long you talked, once an answered call has ended. */
  seconds: number | null;
};

/** What the call was, for the person looking: the key under Calls.log. */
export type CallOutcome = "missed" | "noAnswer" | "declined" | "declinedByYou" | "busy" | "talked" | "failed" | "ongoing";

type CallRow = {
  id: string;
  match_id: string;
  caller_id: string;
  status: string;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
};

export const CALL_ENTRY_COLUMNS = "id, match_id, caller_id, status, created_at, answered_at, ended_at";

export function toCallEntry(row: CallRow, viewerId: string): CallEntry {
  const seconds =
    row.answered_at && row.ended_at
      ? Math.max(0, Math.round((Date.parse(row.ended_at) - Date.parse(row.answered_at)) / 1000))
      : null;
  return { id: row.id, matchId: row.match_id, outgoing: row.caller_id === viewerId, status: row.status, createdAt: row.created_at, seconds };
}

export function callOutcome(c: Pick<CallEntry, "outgoing" | "status" | "seconds">): CallOutcome {
  if (c.status === "ringing" || c.status === "active") return "ongoing";
  // Talked, even if it ended on a dropped connection.
  if (c.seconds !== null) return "talked";
  switch (c.status) {
    case "declined":
      return c.outgoing ? "declined" : "declinedByYou";
    case "busy":
      return c.outgoing ? "busy" : "missed";
    case "missed":
      return c.outgoing ? "noAnswer" : "missed";
    case "failed":
      return c.outgoing ? "failed" : "missed";
    default:
      return c.outgoing ? "noAnswer" : "missed";
  }
}

/** "4:05" under an hour, "1:02:10" over. */
export function formatCallLength(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
