"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * A thin bar at the top when the phone loses its connection (common on
 * Lebanese networks), and a short "Back online" when it returns -- so a
 * page that won't load says why instead of looking broken.
 */
export default function OfflineBar() {
  const t = useTranslations("Offline");
  const [state, setState] = useState<"online" | "offline" | "back">("online");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const down = () => {
      clearTimeout(timer);
      setState("offline");
    };
    const up = () => {
      setState((was) => (was === "offline" ? "back" : was));
      clearTimeout(timer);
      timer = setTimeout(() => setState("online"), 2500);
    };
    if (!navigator.onLine) down();
    window.addEventListener("offline", down);
    window.addEventListener("online", up);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", down);
      window.removeEventListener("online", up);
    };
  }, []);

  if (state === "online") return null;
  return (
    <div
      role="status"
      className={`fixed inset-x-0 top-0 z-[60] px-4 pb-1.5 pt-[calc(0.375rem+env(safe-area-inset-top))] text-center text-sm font-medium ${
        state === "offline" ? "bg-ink text-background" : "bg-success text-white"
      }`}
    >
      {state === "offline" ? t("offline") : t("back")}
    </div>
  );
}
