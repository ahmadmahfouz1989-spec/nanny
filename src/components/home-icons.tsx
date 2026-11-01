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

/** Delivery & Errands: a delivery scooter with a box on the back. */
export function ScooterIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="6" cy="17" r="2.5" />
      <circle cx="18" cy="17" r="2.5" />
      <path d="M8.5 17h6l2-6h-3M16.5 11l-1.5-4h-2" />
      <path d="M3.5 15V9.5h6V14" />
    </Svg>
  );
}

export function BoxIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.2l8 4.6" />
    </Svg>
  );
}

export function ClockIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function BagIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5.5 8h13l-1 12h-11l-1-12Z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </Svg>
  );
}

/** Moto taxi: a rider on a motorcycle. */
export function MotoIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="5.5" cy="17" r="2.8" />
      <circle cx="18.5" cy="17" r="2.8" />
      <path d="M5.5 17 9 11h5l2.5 6M14 11l2-3.5h2.5" />
      <circle cx="11" cy="5.5" r="1.6" />
      <path d="M11 7.5 10 11" />
    </Svg>
  );
}

/** Cleaning: a house with a sparkle -- the category's icon. */
export function CleanHomeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 11 11 4.5l5 4.3" />
      <path d="M5.5 9.5V20h11v-5" />
      <path d="M9.5 20v-4.5h3V20" />
      <path d="M18.5 3.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </Svg>
  );
}

/** Regular home cleaning: a broom. */
export function BroomIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M19.5 4.5 13 11" />
      <path d="M13.8 10.2c-1.6-1-3.6-.6-4.9.7L5 15l4 4 4.1-3.9c1.3-1.3 1.7-3.3.7-4.9Z" />
      <path d="M7 17l-2.5 2.5M9.5 14l1.5 1.5" />
    </Svg>
  );
}

/** Deep cleaning: sparkles. */
export function SparklesIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 4l1.5 4.5L16 10l-4.5 1.5L10 16l-1.5-4.5L4 10l4.5-1.5L10 4Z" />
      <path d="M17.5 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
    </Svg>
  );
}

/** After building work: a hard hat. */
export function HardHatIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 17.5h17" />
      <path d="M5 17.5V15a7 7 0 0 1 14 0v2.5" />
      <path d="M10 8.3V6.5h4v1.8M12 6.5V12" />
    </Svg>
  );
}

/** Offices and shops: a building. */
export function BuildingIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5.5 20.5V4.5h9v16M14.5 9.5h4v11" />
      <path d="M3.5 20.5h17" />
      <path d="M8.5 8h3M8.5 11.5h3M8.5 15h3" />
    </Svg>
  );
}

/** Windows and glass. */
export function WindowIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" />
      <path d="M12 3.5v17M4.5 12h15" />
      <path d="M7 7.5l2-2" />
    </Svg>
  );
}

/** Sofas, carpets and mattresses: a sofa. */
export function SofaIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 11V8.5A2.5 2.5 0 0 1 8.5 6h7A2.5 2.5 0 0 1 18 8.5V11" />
      <path d="M4.5 18.5v-6a1.5 1.5 0 0 1 3 0v1.5h9v-1.5a1.5 1.5 0 0 1 3 0v6Z" />
      <path d="M6.5 18.5V20M17.5 18.5V20" />
    </Svg>
  );
}

/** Water tanks: a rooftop tank with a drop. */
export function TankIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <ellipse cx="12" cy="6.5" rx="6.5" ry="2" />
      <path d="M5.5 6.5V17c0 1.1 2.9 2 6.5 2s6.5-.9 6.5-2V6.5" />
      <path d="M12 10.5c-1.2 1.5-1.8 2.5-1.8 3.3a1.8 1.8 0 0 0 3.6 0c0-.8-.6-1.8-1.8-3.3Z" />
    </Svg>
  );
}

/** Beauty & wellness: a lotus -- the category's icon. */
export function LotusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 19c-2.5-1.6-3.8-4-3.8-6.8 0-2.4 1.4-4.6 3.8-6.7 2.4 2.1 3.8 4.3 3.8 6.7 0 2.8-1.3 5.2-3.8 6.8Z" />
      <path d="M8.4 10.2C6.5 9.6 4.6 9.7 3 10.5c.4 4.6 4 8.1 9 8.5" />
      <path d="M15.6 10.2c1.9-.6 3.8-.5 5.4.3-.4 4.6-4 8.1-9 8.5" />
    </Svg>
  );
}

/** Hair: scissors. */
export function ScissorsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="6.5" cy="17" r="2.5" />
      <circle cx="17.5" cy="17" r="2.5" />
      <path d="M8.3 15.3 18 4.5M15.7 15.3 6 4.5" />
    </Svg>
  );
}

/** Nails: a nail polish bottle. */
export function NailPolishIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 3.5h4v5h-4z" />
      <path d="M8.5 8.5h7a1.5 1.5 0 0 1 1.5 1.5v8.5a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V10a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M10 13.5h4" />
    </Svg>
  );
}

/** Makeup: a lipstick. */
export function LipstickIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9.5 9.5V6.8l4-3.3v6" />
      <path d="M8 9.5h7v4H8z" />
      <path d="M7 13.5h9v7H7z" />
    </Svg>
  );
}

/** Skincare and facials: a face with a leaf. */
export function FaceIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5c-3.9 0-6.5 3-6.5 7.2 0 4.8 2.9 9.3 6.5 9.3s6.5-4.5 6.5-9.3c0-4.2-2.6-7.2-6.5-7.2Z" />
      <path d="M9.3 10.5h.01M14.7 10.5h.01" strokeWidth={2.4} />
      <path d="M10 15c1.2.8 2.8.8 4 0" />
    </Svg>
  );
}

/** Massage: stacked spa stones. */
export function StonesIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <ellipse cx="12" cy="18" rx="7.5" ry="2.5" />
      <ellipse cx="12" cy="12.8" rx="5.5" ry="2.2" />
      <ellipse cx="12" cy="8.2" rx="3.5" ry="1.8" />
    </Svg>
  );
}

/** Hair removal: a pot of warm wax. */
export function WaxIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 10h14l-1.2 9a1.5 1.5 0 0 1-1.5 1.5H7.7A1.5 1.5 0 0 1 6.2 19L5 10Z" />
      <path d="M4 10h16M9 10V8.5a1 1 0 0 1 2 0V12" />
      <path d="M13 6.5c.6-.8.6-1.7 0-2.5M16 6.5c.6-.8.6-1.7 0-2.5" />
    </Svg>
  );
}

/** Lashes and brows: an eye with lashes. */
export function LashIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 13c2.4-3.2 5.4-4.8 9-4.8s6.6 1.6 9 4.8c-2.4 3.2-5.4 4.8-9 4.8S5.4 16.2 3 13Z" />
      <circle cx="12" cy="13" r="2.3" />
      <path d="M12 8.2V5.5M7.5 9.3 6 7M16.5 9.3 18 7" />
    </Svg>
  );
}

/** Bridal: a crown. */
export function CrownIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 8.5 7.5 13 12 6.5l4.5 6.5L20 8.5l-1.5 9.5h-13L4 8.5Z" />
      <path d="M5.5 20.5h13" />
    </Svg>
  );
}

/** Car services: a car from the front -- the category's icon. */
export function CarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m5 11 1.6-4.2A1.5 1.5 0 0 1 8 5.8h8a1.5 1.5 0 0 1 1.4 1L19 11" />
      <path d="M4.5 11h15a1 1 0 0 1 1 1v4.5h-17V12a1 1 0 0 1 1-1Z" />
      <path d="M6 16.5v2M18 16.5v2M10 14h4" />
      <path d="M7 13.8h.01M17 13.8h.01" strokeWidth={2.6} />
    </Svg>
  );
}

/** Car electrics: a lightning bolt. */
export function BoltIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13 3 5.5 13.5H12l-1 7.5 7.5-10.5H12L13 3Z" />
    </Svg>
  );
}

/** Battery. */
export function BatteryIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="7.5" width="17" height="12" rx="1.5" />
      <path d="M7 7.5V5.5h2.5v2M14.5 7.5V5.5H17v2" />
      <path d="M7 13.5h3M8.5 12v3M14 13.5h3" />
    </Svg>
  );
}

/** Tyres: a wheel. */
export function TireIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5V9M12 15v5.5M3.5 12H9M15 12h5.5" />
    </Svg>
  );
}

/** Car air conditioning: a snowflake. */
export function SnowflakeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
      <path d="M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />
    </Svg>
  );
}

/** Towing: a flatbed truck. */
export function TowTruckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 16.5V11h4l2-3h3v8.5" />
      <path d="M11.5 13.5h10v3h-19" />
      <path d="M13.5 13.5 17 9" />
      <circle cx="6" cy="17.5" r="1.8" />
      <circle cx="17.5" cy="17.5" r="1.8" />
    </Svg>
  );
}

/** Roadside help: a warning triangle. */
export function WarningIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4 21 19.5H3L12 4Z" />
      <path d="M12 10v4.5M12 17h.01" />
    </Svg>
  );
}

/** Bodywork and paint: a paint brush. */
export function BrushIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M19.5 3.5 11 12" />
      <path d="M11.5 11.5c-2.3-1-4.5.2-4.8 2.5-.2 1.6-.9 3-2.7 4 3.6 1.2 7.6.4 8.3-2.8.3-1.4.1-2.8-.8-3.7Z" />
    </Svg>
  );
}

/** Car wash: drops of water. */
export function DropsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 4c-2.2 2.9-3.5 5-3.5 6.8a3.5 3.5 0 0 0 7 0C12.5 9 11.2 6.9 9 4Z" />
      <path d="M16.5 11c-1.4 1.8-2.2 3.1-2.2 4.3a2.2 2.2 0 0 0 4.4 0c0-1.2-.8-2.5-2.2-4.3Z" />
      <path d="M4.5 20h15" />
    </Svg>
  );
}
