import { ui } from "@/lib/ui";

// Grey placeholders shaped like the content that's loading, so a page keeps
// its layout instead of jumping when data arrives. The pulse is skipped for
// people who ask their device for less motion.

const block = "rounded-md bg-surface-sunken motion-safe:animate-pulse";

function Line({ className = "" }: { className?: string }) {
  return <div className={`${block} h-3 ${className}`} />;
}

/** Stand-in for a list of match / saved-profile / feed cards. */
export function CardListSkeleton({ count = 3, label }: { count?: number; label: string }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={ui.card + " overflow-hidden"}>
          <div className={`${block} h-24 rounded-none`} />
          <div className="flex flex-col gap-2.5 p-5">
            <Line className="w-2/5" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }, (_, d) => (
                <div key={d} className={`${block} h-7`} />
              ))}
            </div>
            <Line className="w-4/5" />
            <Line className="w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stand-in for conversation / notification rows: avatar plus two lines. */
export function RowListSkeleton({ count = 4, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border p-4">
          <div className={`${block} h-12 w-12 shrink-0 rounded-full`} />
          <div className="flex flex-1 flex-col gap-2">
            <Line className="w-1/2" />
            <Line className="w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stand-in for a few lines of text (e.g. a profile preview). */
export function TextSkeleton({ lines = 3, label }: { lines?: number; label: string }) {
  return (
    <div className="mt-2 flex flex-col gap-2" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, i) => (
        <Line key={i} className={i === lines - 1 ? "w-2/3" : "w-full"} />
      ))}
    </div>
  );
}
