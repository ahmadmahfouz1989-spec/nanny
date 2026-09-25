"use client";

import { useState } from "react";
import ProfileHeaderCard from "@/components/profile-header-card";
import { ui } from "@/lib/ui";

export type ProfileTabDef = {
  key: string;
  profileId: string;
  initialPhotoUrl: string | null;
  label: string;
  slug: string;
  role: "seeker" | "provider";
  categoryLabel: string;
  roleLabel: string;
  fullName: string | null;
  moderationStatus: string;
};


/**
 * An account can hold a profile per category (and both roles in one) --
 * this switches between them on the shared /profile page. Skips the tab bar entirely when there's
 * just one profile, since a switcher with one option is dead weight.
 */
export default function ProfileTabs({ tabs }: { tabs: ProfileTabDef[] }) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  if (!active) return null;

  return (
    <div className="mb-5">
      {tabs.length > 1 && (
        <div className="flex items-center gap-1 rounded-xl bg-surface-sunken p-1 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveKey(tab.key)}
              className={ui.toggleTab(tab.key === active.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <ProfileHeaderCard
        key={active.key}
        profileId={active.profileId}
        initialPhotoUrl={active.initialPhotoUrl}
        slug={active.slug}
        role={active.role}
        categoryLabel={active.categoryLabel}
        roleLabel={active.roleLabel}
        fullName={active.fullName}
        moderationStatus={active.moderationStatus}
      />
    </div>
  );
}
