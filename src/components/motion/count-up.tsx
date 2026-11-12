"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up to its value (points, totals), from `from` --
 * 0 by default, or what it was last time. Formatting is the caller's.
 */
export default function CountUp({ value, from = 0, ms = 700, format = String }: { value: number; from?: number; ms?: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(from);
  const raf = useRef(0);
  useEffect(() => {
    // No counting with reduced motion or nothing to count: straight to the value.
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches || from === value ? 0 : ms;
    const start = performance.now();
    const tick = (now: number) => {
      const p = duration ? Math.min(1, (now - start) / duration) : 1;
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, from, ms]);
  return <>{format(shown)}</>;
}
