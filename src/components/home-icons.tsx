/**
 * Line icons for Home and the phone menu, drawn on the same 24px grid and
 * stroke as nav-icons.tsx. Each takes a className for size and color.
 */

type IconProps = { className?: string };

function Svg({ className = "", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function BabyIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12.5" r="8" />
      <path d="M12 4.5c-1.2 0-2 .8-2 1.8 0 .8.6 1.4 1.4 1.4" />
      <circle cx="9.2" cy="11.5" r=".6" fill="currentColor" />
      <circle cx="14.8" cy="11.5" r=".6" fill="currentColor" />
      <path d="M9.5 15.2c1.4 1.3 3.6 1.3 5 0" />
    </Svg>
  );
}

export function NurseIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7.5 7.5V4.8L12 3.5l4.5 1.3v2.7" />
      <path d="M12 4.6v2M11 5.6h2" />
      <path d="M7.5 8c0 2.8 2 5 4.5 5s4.5-2.2 4.5-5" />
      <path d="M7.5 8h9" />
      <path d="M4.5 21v-1.5c0-2.6 2.2-4.5 4.8-4.5h5.4c2.6 0 4.8 1.9 4.8 4.5V21" />
      <path d="M12 15v6" />
    </Svg>
  );
}

export function BookOpenIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 6.5C10.5 5.2 8.3 4.5 5.5 4.5H3.5v13h2c2.8 0 5 .7 6.5 2 1.5-1.3 3.7-2 6.5-2h2v-13h-2c-2.8 0-5 .7-6.5 2Z" />
      <path d="M12 6.5v13" />
      <path d="M6 8.5h3M6 11.5h3M15 8.5h3M15 11.5h3" />
    </Svg>
  );
}

export function WrenchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14.7 6.3a4 4 0 0 0-5.2 5.1L4 16.9a1.9 1.9 0 0 0 2.7 2.7l5.5-5.5a4 4 0 0 0 5.1-5.2l-2.5 2.5-2.4-.4-.4-2.4 2.7-2.3Z" />
    </Svg>
  );
}

export function DotsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="6" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="18" cy="12" r="1.2" fill="currentColor" />
    </Svg>
  );
}

export function ShieldCheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5 5 6v5.5c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9V6l-7-2.5Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </Svg>
  );
}

export function FlagReportIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5.5 21V4" />
      <path d="M5.5 4.5h11l-2 4 2 4h-11" />
    </Svg>
  );
}

export function FreeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="5.5" />
      <text x="12" y="14.6" textAnchor="middle" fontSize="6.4" fontWeight="700" fill="currentColor" stroke="none">
        100%
      </text>
    </Svg>
  );
}

export function LockIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <path d="M12 14.5v2" />
    </Svg>
  );
}

export function PinIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </Svg>
  );
}

export function ChevronIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className + " rtl:scale-x-[-1]"}>
      <path d="m9 5 7 7-7 7" />
    </Svg>
  );
}

export function ChevronDownIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </Svg>
  );
}

export function PersonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20.5c.6-3.7 3.7-6 7.5-6s6.9 2.3 7.5 6" />
    </Svg>
  );
}

export function ProviderIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10" cy="7.5" r="3.5" />
      <path d="M3.5 19.5c.5-3.4 3.2-5.5 6.5-5.5 1 0 1.9.2 2.7.5" />
      <rect x="13.5" y="14.5" width="7.5" height="6" rx="1.2" />
      <path d="M15.5 14.5v-1.2h3.5v1.2M13.5 17.3h7.5" />
    </Svg>
  );
}

export function BriefcaseIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="7" width="17" height="12.5" rx="2" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17M12 11.5v2" />
    </Svg>
  );
}

export function ClipboardIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 3.8h6M8.5 11h7M8.5 14.5h7M8.5 18h4" />
    </Svg>
  );
}

export function BookmarkIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6.5 4.5h11v16L12 16.5l-5.5 4v-16Z" />
    </Svg>
  );
}

export function GearIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.5-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.5l-2.4-1-2 3.5 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4 1 2-3.5-2-1.5Z" />
    </Svg>
  );
}

export function SendIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5 21 3Z" />
    </Svg>
  );
}

export function MoonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 13.8A8 8 0 1 1 10.2 4a6.3 6.3 0 0 0 9.8 9.8Z" />
    </Svg>
  );
}

export function GlobeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5s1.1-6.1 3.4-8.5Z" />
    </Svg>
  );
}

export function LogoutIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className + " rtl:scale-x-[-1]"}>
      <path d="M9.5 4.5h-4v15h4M14.5 8l4 4-4 4M18.5 12H9" />
    </Svg>
  );
}

export function CameraIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 8.5h3l1.5-2.5h7L17 8.5h3v10H4v-10Z" />
      <circle cx="12" cy="13" r="3.2" />
    </Svg>
  );
}

export function CloseIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function BellIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2ZM10 20.5a2 2 0 0 0 4 0" />
    </Svg>
  );
}

export function DocumentIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 3.5h7l4 4v13H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5v4h4M9 12h6M9 15.5h6" />
    </Svg>
  );
}

export function WhatsAppIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.5a9.4 9.4 0 0 0-8.1 14.2L2.6 21.5l4.9-1.3A9.4 9.4 0 1 0 12 2.5Zm0 17.2a7.8 7.8 0 0 1-4-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A7.8 7.8 0 1 1 12 19.7Zm4.3-5.8c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.4 6.4 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.7 2.7 0 0 0-.9 2c0 1.2.9 2.3 1 2.5.1.2 1.7 2.6 4.2 3.7 1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z" />
    </svg>
  );
}
