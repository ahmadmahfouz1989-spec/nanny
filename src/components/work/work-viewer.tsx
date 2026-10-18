"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import Modal from "./modal";
import type { WorkProject } from "@/lib/work";

/** One project full screen: swipe (or arrow) through its photos, captions below. */
export default function WorkViewer({ project, onClose }: { project: WorkProject; onClose: () => void }) {
  const t = useTranslations("Work");
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const total = project.photos.length;

  function go(to: number) {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(total - 1, to));
    // scrollLeft runs negative in RTL; scrollIntoView handles both directions.
    (el.children[next] as HTMLElement | undefined)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }

  function onScroll() {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
  }

  return (
    <Modal label={project.title} onClose={onClose} wide>
      <div className="flex h-full flex-col sm:max-h-[90dvh]">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <h2 dir="auto" className="font-display text-lg font-semibold min-w-0 truncate flex-1">
            {project.title}
          </h2>
          {total > 1 && (
            <span className="text-xs text-muted tabular-nums shrink-0">
              {t("photoOf", { current: index + 1, total })}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="relative bg-black">
            <div
              ref={track}
              onScroll={onScroll}
              className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {project.photos.map((photo, i) => (
                <figure key={photo.id} className="w-full shrink-0 snap-start">
                  <Image
                    src={photo.url}
                    alt={photo.caption ?? ""}
                    width={photo.width ?? 1600}
                    height={photo.height ?? 1200}
                    unoptimized
                    priority={i === 0}
                    className="mx-auto max-h-[60dvh] w-auto max-w-full object-contain"
                  />
                </figure>
              ))}
            </div>
            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(index - 1)}
                  disabled={index === 0}
                  aria-label={t("previous")}
                  className="absolute start-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-0"
                >
                  <span aria-hidden className="rtl:scale-x-[-1]">‹</span>
                </button>
                <button
                  type="button"
                  onClick={() => go(index + 1)}
                  disabled={index === total - 1}
                  aria-label={t("next")}
                  className="absolute end-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-0"
                >
                  <span aria-hidden className="rtl:scale-x-[-1]">›</span>
                </button>
                <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1.5">
                  {project.photos.map((p, i) => (
                    <span key={p.id} className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/40"}`} />
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="p-4 flex flex-col gap-2">
            {project.photos[index]?.caption && (
              <p dir="auto" className="text-sm font-medium text-ink">
                {project.photos[index].caption}
              </p>
            )}
            {project.description && (
              <p dir="auto" className="text-sm text-ink/80 whitespace-pre-wrap">
                {project.description}
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
