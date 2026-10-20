"use client";

import { useEffect, useRef, useState } from "react";
import { APP_MAIN_ID } from "@/components/shell/mobile-chrome";
import { ui } from "@/lib/ui";

/**
 * The profile page's section bar (Work, About, Details, Reviews), like the
 * tabs under an X profile: it sticks below the top bar while you scroll,
 * highlights the section you're reading, and jumps to one when tapped.
 */
export default function ProfileSectionNav({ sections }: { sections: { id: string; label: string }[] }) {
  const [current, setCurrent] = useState(sections[0]?.id);
  // After a tap, the tapped tab stays highlighted while the page scrolls
  // there -- the last sections can be too short to reach the "being read"
  // band on their own.
  const pinnedUntil = useRef(0);

  useEffect(() => {
    const root = document.getElementById(APP_MAIN_ID);
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < pinnedUntil.current) return;
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      // A section counts as "being read" once it reaches the upper third.
      { root: root && root.scrollHeight > root.clientHeight ? root : null, rootMargin: "-25% 0px -65% 0px" },
    );
    for (const { id } of sections) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  if (sections.length < 2) return null;

  return (
    <nav className="app-sticky-top sticky z-10 -mx-4 sm:mx-0 bg-background/95 backdrop-blur px-4 sm:px-0 py-2 border-b border-border sm:border-0">
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              setCurrent(id);
              pinnedUntil.current = Date.now() + 1500;
              document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            aria-current={current === id ? "true" : undefined}
            className={ui.pill(current === id) + " shrink-0 whitespace-nowrap"}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}
