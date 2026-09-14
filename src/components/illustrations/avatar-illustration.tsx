import type { CSSProperties } from "react";

const TONE_BG: Record<"primary" | "secondary" | "berry", string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  berry: "bg-berry",
};

export default function AvatarIllustration({
  tone,
  className = "",
  style,
}: {
  tone: "primary" | "secondary" | "berry";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`flex items-center justify-center ${TONE_BG[tone]} ${className}`} style={style}>
      <svg viewBox="0 0 100 100" className="h-16 w-16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="36" r="17" fill="white" fillOpacity="0.92" />
        <path d="M18 92c0-21 14-36 32-36s32 15 32 36" fill="white" fillOpacity="0.92" />
      </svg>
    </div>
  );
}
