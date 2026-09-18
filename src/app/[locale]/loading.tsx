import { AnimatedLogo } from "@/components/animated-logo";

/**
 * Next's instant-loading fallback (see loading.js file convention) --
 * shown immediately on navigation while the destination page's data
 * fetch is in flight, for any route under [locale] without its own more
 * specific loading.tsx.
 */
export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <AnimatedLogo variant="pulse" size={56} />
    </div>
  );
}
