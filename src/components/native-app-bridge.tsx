"use client";

import { useEffect } from "react";
import { isNativeApp, listenForNativeEvents } from "@/lib/native-app";

/** Inside the iOS/Android apps: notification taps and the sign-in return (see native-app.ts). */
export default function NativeAppBridge() {
  useEffect(() => {
    listenForNativeEvents();
    // An app screen doesn't pinch-zoom: the layout fits the phone exactly,
    // so a zoom (e.g. iOS zooming into a text box) had nowhere to zoom
    // back out to and stayed stuck. Capping the scale also undoes one that
    // already happened. The website in a browser keeps pinch-zoom.
    if (isNativeApp()) {
      document
        .querySelector('meta[name="viewport"]')
        ?.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
    }
  }, []);
  return null;
}
