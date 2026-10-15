"use client";

import { useEffect } from "react";
import { listenForNativeEvents } from "@/lib/native-app";

/** Inside the iOS/Android apps: notification taps and the sign-in return (see native-app.ts). */
export default function NativeAppBridge() {
  useEffect(() => {
    listenForNativeEvents();
  }, []);
  return null;
}
