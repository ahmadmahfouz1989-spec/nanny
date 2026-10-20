import { headers } from "next/headers";

// Appended to the web view's user agent by the iOS/Android apps
// (appendUserAgent in mobile/capacitor.config.ts).
const APP_USER_AGENT_MARKER = "ouiKnowApp";

/** Whether this request comes from the iOS/Android app rather than a browser. */
export async function isNativeAppRequest() {
  return ((await headers()).get("user-agent") ?? "").includes(APP_USER_AGENT_MARKER);
}
