import Image from "next/image";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import VerifiedCheck from "@/components/verified-check";

/**
 * The top of a profile: a slim cover from their work (a soft colour band
 * when there's none), their face in a circle over its edge, then the name
 * in plain text. The profile photo used to fill a tall banner with the
 * name on it -- a door or a logo took over the whole page.
 */
export default function ProfileHero({
  name,
  photoUrl,
  coverUrl,
  verified,
  verifiedLabel,
  subtitle,
  badge,
}: {
  name: string;
  photoUrl: string | null;
  /** A work photo, when they have one. */
  coverUrl: string | null;
  verified: boolean;
  verifiedLabel: string;
  subtitle: string;
  /** Something for the cover's corner (a match score). */
  badge?: React.ReactNode;
}) {
  return (
    <div>
      <div className="relative h-28 sm:h-36">
        {coverUrl ? (
          <Image src={coverUrl} alt="" fill sizes="(min-width: 640px) 672px, 100vw" unoptimized priority className="object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary-soft via-surface-sunken to-secondary-soft" />
        )}
        {badge && <div className="absolute end-3 top-3">{badge}</div>}
      </div>
      <div className="px-4 sm:px-5">
        <div className="relative z-10 -mt-12 h-24 w-24 overflow-hidden rounded-full border-4 border-surface bg-surface shadow-sm sm:-mt-14 sm:h-28 sm:w-28">
          {photoUrl ? (
            <Image src={photoUrl} alt="" width={224} height={224} unoptimized priority className="h-full w-full object-cover" />
          ) : (
            <AvatarIllustration name={name} className="h-full w-full" />
          )}
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink sm:text-3xl">
          {name}
          {verified && (
            <span className="ms-1.5 inline-flex align-middle">
              <VerifiedCheck label={verifiedLabel} />
            </span>
          )}
        </h1>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>
    </div>
  );
}
