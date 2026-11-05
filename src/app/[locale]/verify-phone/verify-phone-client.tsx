"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import AddPhoneForm from "@/components/add-phone-form";

export default function VerifyPhoneClient({ next }: { next: string }) {
  const t = useTranslations("AccountDetails");
  const router = useRouter();
  return (
    <div className="max-w-lg w-full mx-auto px-6 py-8">
      <h1 className="font-display text-2xl font-bold">{t("verifyTitle")}</h1>
      <p className="mt-2 mb-6 text-muted">{t("verifyBody")}</p>
      <AddPhoneForm
        onDone={() => {
          router.push(next);
          router.refresh();
        }}
      />
    </div>
  );
}
