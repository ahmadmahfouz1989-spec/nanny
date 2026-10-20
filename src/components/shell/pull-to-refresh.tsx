"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { haptic } from "@/lib/native-app";
import { APP_MAIN_ID } from "./mobile-chrome";

/**
 * Fired when someone pulls to refresh. Lists that load in the browser
 * (feed, matches, notifications) reload on it; everything rendered on the
 * server comes back fresh through router.refresh().
 */
export const APP_REFRESH_EVENT = "app-refresh";

/** Reruns `reload` on pull to refresh. */
export function useOnAppRefresh(reload: () => void) {
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  });
  useEffect(() => {
    const onRefresh = () => reloadRef.current();
    window.addEventListener(APP_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(APP_REFRESH_EVENT, onRefresh);
  }, []);
}

const TRIGGER = 70;
const MAX = 110;

/**
 * Pull down from the top of any page to refresh it, as in X's app: a
 * spinner follows your finger and spins once you've pulled far enough.
 * Touch screens only; the page itself never moves, so nothing jumps.
 */
export default function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, startRefresh] = useTransition();
  const [holding, setHolding] = useState(false);
  const pullRef = useRef(0);

  useEffect(() => {
    const main = document.getElementById(APP_MAIN_ID);
    if (!main) return;
    let startY: number | null = null;
    let armed = false;

    // Something under the finger that scrolls on its own (a chat thread, a
    // photo strip) and isn't at its top: the pull is scrolling that.
    function insideScrolledBox(target: EventTarget | null) {
      for (let el = target as HTMLElement | null; el && el !== main; el = el.parentElement) {
        if (el.scrollTop > 0) return true;
      }
      return false;
    }
    function onStart(e: TouchEvent) {
      const inDialog = !!(e.target as Element | null)?.closest?.("dialog");
      startY =
        main!.scrollTop <= 0 && e.touches.length === 1 && !inDialog && !insideScrolledBox(e.target)
          ? e.touches[0].clientY
          : null;
    }
    function onMove(e: TouchEvent) {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || main!.scrollTop > 0) {
        if (pullRef.current) set(0);
        return;
      }
      const next = Math.min(MAX, dy * 0.5);
      if (next >= TRIGGER && !armed) {
        armed = true;
        haptic();
      } else if (next < TRIGGER) {
        armed = false;
      }
      set(next);
    }
    function onEnd() {
      if (startY === null) return;
      startY = null;
      const go = pullRef.current >= TRIGGER;
      armed = false;
      set(0);
      if (!go) return;
      setHolding(true);
      window.dispatchEvent(new Event(APP_REFRESH_EVENT));
      startRefresh(() => router.refresh());
      // Client lists reload on their own time; keep the spinner up long
      // enough to read as "done" rather than a flicker.
      window.setTimeout(() => setHolding(false), 700);
    }
    function set(value: number) {
      pullRef.current = value;
      setPull(value);
    }

    main.addEventListener("touchstart", onStart, { passive: true });
    main.addEventListener("touchmove", onMove, { passive: true });
    main.addEventListener("touchend", onEnd);
    main.addEventListener("touchcancel", onEnd);
    return () => {
      main.removeEventListener("touchstart", onStart);
      main.removeEventListener("touchmove", onMove);
      main.removeEventListener("touchend", onEnd);
      main.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const spinning = refreshing || holding;
  const offset = spinning ? TRIGGER * 0.75 : pull * 0.75;
  if (!spinning && pull === 0) return null;

  return (
    <div
      aria-hidden
      className="sm:hidden pointer-events-none fixed inset-x-0 z-20 flex justify-center top-[calc(3.5rem+env(safe-area-inset-top))]"
      style={{ transform: `translateY(${offset - 40}px)`, transition: pull === 0 ? "transform 200ms ease" : undefined }}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface shadow-md">
        <svg
          viewBox="0 0 24 24"
          className={`h-5 w-5 text-primary ${spinning ? "animate-spin" : ""}`}
          style={spinning ? undefined : { transform: `rotate(${(pull / TRIGGER) * 270}deg)`, opacity: Math.min(1, pull / TRIGGER) }}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
        >
          <path d="M20 12a8 8 0 1 1-2.34-5.66" strokeLinecap="round" />
          <path d="M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}
