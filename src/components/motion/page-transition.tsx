"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * The page inside the app frame comes in with a hint of where you went:
 * opening something slides it in from the side you read toward, switching
 * tabs cross-fades, going back (the back button, the swipe) doesn't animate
 * -- the phone does that already. A page that showed the loading skeleton
 * first comes in the same way when it's ready. The header and tab bar stay
 * put: they're outside this.
 *
 * What you tapped is noted on the way out (one listener for the whole
 * app), and read when the next page appears. Every page draws its own app
 * frame, so this mounts once per page.
 */
type Move = "forward" | "tab";
let pending: { move: Move; at: number } | null = null;
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a || (a as HTMLAnchorElement).target === "_blank") return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/") || href.startsWith("//")) return;
      pending = { move: a.closest(".app-chrome-bottom, aside nav") ? "tab" : "forward", at: Date.now() };
    },
    true,
  );
  window.addEventListener("popstate", () => (pending = null));
}

export default function PageTransition({ className, children }: { className: string; children: React.ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    listen();
    const move = pending && Date.now() - pending.at < 8000 ? pending.move : null;
    pending = null;
    const node = el.current;
    if (!move || !node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rtl = document.documentElement.dir === "rtl";
    node.animate(
      move === "tab"
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0.35, transform: `translateX(${rtl ? -28 : 28}px)` },
            { opacity: 1, transform: "none" },
          ],
      { duration: move === "tab" ? 160 : 230, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  }, []);
  return (
    <div ref={el} className={className}>
      {children}
    </div>
  );
}
