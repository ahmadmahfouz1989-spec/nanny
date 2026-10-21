import { headers } from "next/headers";
import { APP_USER_AGENT_MARKER } from "@/lib/app-user-agent";

/** Whether this request comes from the iOS/Android app rather than a browser. */
export async function isNativeAppRequest() {
  return ((await headers()).get("user-agent") ?? "").includes(APP_USER_AGENT_MARKER);
}
