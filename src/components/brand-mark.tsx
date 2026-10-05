import Image from "next/image";
import { Link } from "@/i18n/navigation";
import brandMark from "../../public/images/brand-mark.png";

/**
 * Logo + wordmark linking home. `compact` keeps just the icon on very
 * narrow phones (the wordmark stays for screen readers), for headers that
 * otherwise run out of room.
 */
export default function BrandMark({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 ${className}`}>
      <Image src={brandMark} alt="" width={32} height={32} className="shrink-0" priority />
      <span className={`font-brand text-xl font-bold tracking-tight text-ink ${compact ? "max-[399px]:sr-only" : ""}`}>ouiKnow</span>
    </Link>
  );
}
