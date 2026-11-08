import type { CSSProperties } from "react";

// Someone without a photo: their initials on a soft colour that's always the
// same for the same name, so a list of people without photos reads as
// different people -- not a wall of identical orange figures. Without a name,
// a quiet grey figure.

const TONES = [
  "bg-primary-soft text-primary",
  "bg-secondary-soft text-secondary",
  "bg-berry-soft text-berry",
  "bg-accent-soft text-accent-hover",
  "bg-sky-soft text-sky-ink",
  "bg-success-soft text-success",
] as const;

/** Up to two letters: first and last word ("Maya Khoury" -> "MK", "رانيا حداد" -> "رح"). */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = [...words[0]!][0] ?? "";
  const last = words.length > 1 ? ([...words[words.length - 1]!][0] ?? "") : "";
  return (first + last).toLocaleUpperCase();
}

// A banner carries the name in white on top: deep colours, faint letters.
const BANNER_TONES = ["bg-primary", "bg-secondary", "bg-berry", "bg-sky-ink", "bg-success"] as const;

function hashOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h;
}
const toneOf = (name: string) => TONES[hashOf(name) % TONES.length]!;

export default function AvatarIllustration({
  name,
  className = "",
  style,
  banner = false,
}: {
  /** The person's name: their initials are shown. */
  name?: string | null;
  /** Kept for callers that still pass it; the colour now follows the name. */
  tone?: "primary" | "secondary" | "berry";
  className?: string;
  style?: CSSProperties;
  /** Full-width card banner: keep the letters towards the far side, clear of the name written at the start. */
  banner?: boolean;
}) {
  const letters = initialsOf(name);
  const align = banner ? "justify-end pe-10" : "justify-center";
  if (banner) {
    const bg = letters ? BANNER_TONES[hashOf(name!.trim()) % BANNER_TONES.length]! : "bg-primary";
    return (
      <div className={`flex items-center ${align} ${bg} text-white ${className}`} style={{ containerType: "size", ...style }} aria-hidden>
        {letters ? (
          <span className="font-semibold opacity-30" style={{ fontSize: "55cqh", lineHeight: 1 }}>
            {letters}
          </span>
        ) : (
          <svg viewBox="0 0 100 100" className="h-16 w-16" fill="none">
            <circle cx="50" cy="36" r="17" fill="white" fillOpacity="0.92" />
            <path d="M18 92c0-21 14-36 32-36s32 15 32 36" fill="white" fillOpacity="0.92" />
          </svg>
        )}
      </div>
    );
  }
  if (!letters) {
    return (
      <div className={`flex items-center ${align} bg-surface-sunken text-muted ${className}`} style={style} aria-hidden>
        <svg viewBox="0 0 100 100" className="h-[62%] w-[62%]" fill="none">
          <circle cx="50" cy="36" r="17" fill="currentColor" fillOpacity="0.45" />
          <path d="M18 92c0-21 14-36 32-36s32 15 32 36" fill="currentColor" fillOpacity="0.45" />
        </svg>
      </div>
    );
  }
  return (
    <div
      className={`flex items-center ${align} font-semibold ${toneOf(name!.trim())} ${className}`}
      style={{ containerType: "size", ...style }}
      aria-hidden
    >
      <span style={{ fontSize: banner ? "42cqh" : "40cqmin", lineHeight: 1 }}>{letters}</span>
    </div>
  );
}
