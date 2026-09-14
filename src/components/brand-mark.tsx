import Image from "next/image";
import { Link } from "@/i18n/navigation";
import brandMark from "../../public/images/brand-mark.png";

export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 ${className}`}>
      <Image src={brandMark} alt="" width={32} height={32} className="shrink-0" priority />
      <span className="font-brand text-xl font-bold tracking-tight text-ink">ouiKnow</span>
    </Link>
  );
}
