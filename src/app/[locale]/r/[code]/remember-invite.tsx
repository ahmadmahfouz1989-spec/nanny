"use client";

import { useEffect } from "react";
import { rememberInvite } from "@/lib/invite-capture";

/** Keeps the invite on this device, for whichever account is made here next. */
export default function RememberInvite({ code }: { code: string }) {
  useEffect(() => rememberInvite(code, "link"), [code]);
  return null;
}
