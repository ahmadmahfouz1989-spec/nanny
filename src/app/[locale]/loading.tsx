import { AnimatedLogo } from "@/components/animated-logo";
import { ui } from "@/lib/ui";

const block = "rounded-md bg-surface-sunken motion-safe:animate-pulse";

/**
 * Shown the moment someone taps through to another page, while it loads:
 * the shape of a page (header, a title, a few cards, the tab bar) rather
 * than an empty screen, so a slow connection still feels like the app is
 * on its way. Plain on purpose -- no data, nothing to wait for.
 */
export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col bg-background" role="status" aria-busy="true">
      <div className="flex h-14 items-center border-b border-border px-4 pt-[env(safe-area-inset-top)]">
        <AnimatedLogo size={28} />
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
        <div className={`${block} h-7 w-1/2`} />
        <div className={`${block} h-3 w-3/4`} />
        {[0, 1, 2].map((i) => (
          <div key={i} className={ui.card + " flex gap-3 p-4"}>
            <div className={`${block} h-16 w-16 shrink-0 rounded-xl`} />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <div className={`${block} h-3 w-2/5`} />
              <div className={`${block} h-3 w-4/5`} />
              <div className={`${block} h-3 w-3/5`} />
            </div>
          </div>
        ))}
      </div>
      <div className="h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-border bg-surface sm:hidden" />
    </div>
  );
}
