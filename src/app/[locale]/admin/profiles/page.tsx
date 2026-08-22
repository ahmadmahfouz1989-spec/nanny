"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";

type QueueProfile = {
  id: string;
  full_name: string;
  profile_photo_url?: string | null;
  profileType: "parent" | "nanny";
  locations: { name_en: string; name_ar: string; name_fr: string } | null;
  created_at: string;
};

function localizedLocationName(
  loc: { name_en: string; name_ar: string; name_fr: string } | null,
  locale: string,
) {
  if (!loc) return null;
  if (locale === "ar") return loc.name_ar;
  if (locale === "fr") return loc.name_fr;
  return loc.name_en;
}

export default function AdminProfilesPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const [profiles, setProfiles] = useState<QueueProfile[] | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/profiles?moderationStatus=pending")
      .then((res) => res.json())
      .then((body) => setProfiles(body.profiles));
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(profile: QueueProfile, status: "approved" | "rejected", rejectNotes?: string) {
    setSubmitting(profile.id);
    await fetch(`/api/admin/profiles/${profile.id}/moderation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileType: profile.profileType, status, notes: rejectNotes }),
    });
    setSubmitting(null);
    setRejecting(null);
    setNotes("");
    setProfiles((prev) => prev?.filter((p) => p.id !== profile.id) ?? null);
  }

  return (
    <>
      <h1 className="font-display text-3xl font-semibold mb-8">{t("profilesTitle")}</h1>

      {profiles && profiles.length === 0 && <p className="text-sm text-muted">{t("profilesEmpty")}</p>}

      <div className="flex flex-col gap-4">
        {profiles?.map((profile) => {
          const area = localizedLocationName(profile.locations, locale);
          return (
            <div key={profile.id} className={ui.card + " p-5 flex gap-4"}>
              {profile.profile_photo_url ? (
                <Image
                  src={profile.profile_photo_url}
                  alt=""
                  width={56}
                  height={56}
                  unoptimized
                  className="h-14 w-14 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-primary-soft shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-display text-lg font-semibold truncate">{profile.full_name}</p>
                  <span className={ui.badge("secondary")}>
                    {profile.profileType === "parent" ? t("typeParent") : t("typeNanny")}
                  </span>
                </div>
                {area && <p className="text-sm text-muted mb-3">{area}</p>}

                {rejecting === profile.id ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      className={ui.input}
                      rows={2}
                      placeholder={t("rejectNotesPlaceholder")}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => decide(profile, "rejected", notes)}
                        disabled={submitting === profile.id}
                        className={ui.buttonPrimary + " px-4! py-1.5! text-sm"}
                      >
                        {t("confirmReject")}
                      </button>
                      <button onClick={() => setRejecting(null)} className={ui.buttonGhost + " text-sm"}>
                        {t("cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => decide(profile, "approved")}
                      disabled={submitting === profile.id}
                      className={ui.buttonPrimary + " px-4! py-1.5! text-sm"}
                    >
                      {t("approve")}
                    </button>
                    <button
                      onClick={() => setRejecting(profile.id)}
                      disabled={submitting === profile.id}
                      className={ui.buttonSecondary + " px-4! py-1.5! text-sm"}
                    >
                      {t("reject")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
