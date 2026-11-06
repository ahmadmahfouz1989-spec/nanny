"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import CategoryIcon from "@/components/category-icon";

export type ServiceChip = { slug: string; name: string; icon: string };

/**
 * The tapped service lights up at once, even on a slow connection, while the
 * current page stays until the next one is ready. The one you're in is
 * always scrolled into view, however many you have.
 */
export default function ServiceChips({ services, current, label, addLabel }: { services: ServiceChip[]; current: string; label: string; addLabel: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tapped, setTapped] = useState<string | null>(null);
  const shown = isPending && tapped ? tapped : current;
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [shown]);

  return (
    <nav aria-label={label} className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none]">
      {services.map((c) => {
        const active = c.slug === shown;
        const href = `/categories/${c.slug}/dashboard`;
        return (
          <Link
            key={c.slug}
            ref={active ? activeRef : undefined}
            href={href}
            replace
            aria-current={c.slug === current ? "page" : undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || c.slug === current) return;
              e.preventDefault();
              setTapped(c.slug);
              startTransition(() => router.replace(href));
            }}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
              active ? "border-ink bg-ink text-background" : "border-border bg-surface text-ink/80 hover:border-border-strong"
            } ${active && isPending ? "animate-pulse" : ""}`}
          >
            <CategoryIcon name={c.icon} className="h-4 w-4" />
            {c.name}
          </Link>
        );
      })}
      <Link href="/categories" className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border-strong px-3.5 py-2 text-sm font-medium text-muted hover:text-ink">
        + {addLabel}
      </Link>
    </nav>
  );
}
