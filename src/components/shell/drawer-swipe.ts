"use client";

import { useEffect, useRef, type RefObject } from "react";
import { haptic, isNativeApp } from "@/lib/native-app";

/**
 * The phone's main tab screens -- where swiping toward the menu opens it,
 * as on X. Everywhere else the same swipe stays "back".
 */
// Mirrored in the iPhone app (AppViewController.tabRoot), which hands the
// screen edge to this swipe on these screens.
const TAB_ROOTS = [/^\/feed$/, /^\/notifications$/, /^\/messages$/, /^\/dashboard$/, /^\/categories\/[^/]+\/dashboard$/];

export function isTabRoot(pathname: string) {
  return TAB_ROOTS.some((re) => re.test(pathname));
}

/** The screen edge Safari keeps for its own swipe back (the app gives it to us). */
const EDGE = 24;
/** How far a finger moves before we decide it's a sideways swipe, not a scroll. */
const SLOP = 10;
/** Past this share of the menu, letting go finishes the swipe. */
const COMMIT = 0.4;
/** A flick this fast (px/ms) finishes it however short. */
const FLICK = 0.5;

/** Something under the finger that scrolls sideways on its own, or opts out. */
function ownsSideways(target: EventTarget | null) {
  for (let el = target as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
    if (el.tagName === "DIALOG" || el.hasAttribute("data-no-drawer-swipe")) return true;
    if (el.scrollWidth > el.clientWidth) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
  }
  return false;
}

/**
 * Swipe the phone menu open from anywhere on a tab screen, and swipe it
 * closed again. The menu follows the finger; letting go past COMMIT (or a
 * quick flick) finishes the move, otherwise it slides back. In Arabic the
 * menu sits on the right, so everything mirrors.
 */
export function useDrawerSwipe({
  enabled,
  open,
  setOpen,
  drawer,
  backdrop,
}: {
  enabled: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  drawer: RefObject<HTMLElement | null>;
  backdrop: RefObject<HTMLElement | null>;
}) {
  const state = useRef({ enabled, open, setOpen });
  useEffect(() => {
    state.current = { enabled, open, setOpen };
  });

  useEffect(() => {
    const phone = window.matchMedia("(max-width: 639px)");
    type Gesture = { x: number; y: number; dragging: boolean; width: number; dir: 1 | -1; from: number; lastX: number; lastT: number; v: number };
    let g: Gesture | null = null;

    function paint(progress: number) {
      const el = drawer.current;
      const shade = backdrop.current;
      if (!el || !g) return;
      el.style.transition = "none";
      el.style.translate = `${(progress - 1) * g.width * g.dir}px 0`;
      if (shade) {
        shade.style.transition = "none";
        shade.style.opacity = String(progress);
      }
    }
    function release() {
      for (const el of [drawer.current, backdrop.current]) {
        if (!el) continue;
        el.style.removeProperty("transition");
        el.style.removeProperty("translate");
        el.style.removeProperty("opacity");
      }
    }

    function onStart(e: TouchEvent) {
      g = null;
      const { enabled, open } = state.current;
      if (!phone.matches || e.touches.length !== 1 || !drawer.current) return;
      if (!open && (!enabled || ownsSideways(e.target))) return;
      const dir = document.documentElement.dir === "rtl" ? -1 : 1;
      const t = e.touches[0];
      // In Safari the edge is the browser's back. In the app, tab screens
      // turn that off, so a swipe from the very edge opens the menu, as on X.
      const fromEdge = dir === 1 ? t.clientX : window.innerWidth - t.clientX;
      if (!open && !isNativeApp() && fromEdge < EDGE) return;
      g = {
        x: t.clientX,
        y: t.clientY,
        dragging: false,
        width: drawer.current.offsetWidth,
        dir,
        from: open ? 1 : 0,
        lastX: t.clientX,
        lastT: e.timeStamp,
        v: 0,
      };
    }

    function onMove(e: TouchEvent) {
      if (!g) return;
      const t = e.touches[0];
      const dx = (t.clientX - g.x) * g.dir;
      const dy = t.clientY - g.y;
      if (!g.dragging) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        // Up/down first, or toward where the menu already is: not ours.
        if (Math.abs(dy) > Math.abs(dx) || (g.from === 0 ? dx < 0 : dx > 0)) {
          g = null;
          return;
        }
        g.dragging = true;
      }
      e.preventDefault();
      const dt = e.timeStamp - g.lastT;
      if (dt > 0) g.v = (((t.clientX - g.lastX) * g.dir) / dt) * 0.6 + g.v * 0.4;
      g.lastX = t.clientX;
      g.lastT = e.timeStamp;
      paint(Math.min(1, Math.max(0, g.from + dx / g.width)));
    }

    function onEnd(e: TouchEvent) {
      if (!g?.dragging) {
        g = null;
        return;
      }
      const t = e.changedTouches[0];
      const progress = Math.min(1, Math.max(0, g.from + ((t.clientX - g.x) * g.dir) / g.width));
      const opening = g.from === 0;
      const done = opening ? progress > COMMIT || g.v > FLICK : progress < 1 - COMMIT || g.v < -FLICK;
      const next = opening === done;
      g = null;
      // Set the new state first, so the menu slides on from where the
      // finger left it rather than snapping back for a frame.
      if (next !== state.current.open) {
        if (next) haptic();
        state.current.setOpen(next);
      }
      release();
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      release();
    };
  }, [drawer, backdrop]);
}
