"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";
import type { PointsRule } from "@/lib/points";

async function send(url: string, method: string, body: unknown) {
  const res = await request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res?.json().catch(() => null);
  return { ok: !!res?.ok, error: typeof json?.error === "string" ? json.error : null };
}

/** Released or not: off, nothing is earned and nobody but admins sees it. */
export function ReleaseSwitch({ initial }: { initial: boolean }) {
  const t = useTranslations("AdminPoints");
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <section className={`${ui.card} flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between ${on ? "ring-2 ring-success/40" : ""}`}>
      <div>
        <p className="font-semibold text-ink">{on ? t("releasedOn") : t("releasedOff")}</p>
        <p className="text-sm text-muted">{on ? t("releasedOnBody") : t("releasedOffBody")}</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!on && !window.confirm(t("releaseConfirm"))) return;
          setBusy(true);
          const r = await send("/api/admin/points/settings", "PUT", { enabled: !on });
          setBusy(false);
          if (r.ok) {
            setOn(!on);
            router.refresh();
          }
        }}
        className={on ? ui.buttonSecondary : ui.buttonPrimary}
      >
        {on ? t("turnOff") : t("turnOn")}
      </button>
    </section>
  );
}

type EditableRule = PointsRule & { label: string };
const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.floor(Number(v))) || null);

/** Points per activity, on/off and limits. Empty limit = no limit. */
export function RulesEditor({ rules }: { rules: EditableRule[] }) {
  const t = useTranslations("AdminPoints");
  const router = useRouter();
  const [rows, setRows] = useState(rules);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: string, patch: Partial<EditableRule>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const limit = (value: number | null, onChange: (n: number | null) => void, label: string) => (
    <input
      type="number"
      min={1}
      inputMode="numeric"
      aria-label={label}
      placeholder="∞"
      value={value ?? ""}
      onChange={(e) => onChange(num(e.target.value))}
      className={ui.input + " w-20 py-1.5! text-center"}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-2 text-start font-medium">{t("colActivity")}</th>
              <th className="py-2 font-medium">{t("colOn")}</th>
              <th className="py-2 font-medium">{t("colPoints")}</th>
              <th className="py-2 font-medium">{t("colMaxTotal")}</th>
              <th className="py-2 font-medium">{t("colMaxDay")}</th>
              <th className="py-2 font-medium">{t("colMaxMonth")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-2 pe-2">
                  <span className="block text-ink">{r.label}</span>
                  <span className="text-xs text-muted">{r.kind === "referral" ? t("kindReferral") : t("kindActivity")}</span>
                </td>
                <td className="py-2 text-center">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => set(r.key, { enabled: e.target.checked })} aria-label={t("colOn")} className="h-5 w-5 accent-primary" />
                </td>
                <td className="py-2 text-center">
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={t("colPoints")}
                    value={r.points}
                    onChange={(e) => set(r.key, { points: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                    className={ui.input + " w-20 py-1.5! text-center"}
                  />
                </td>
                <td className="py-2 text-center">{limit(r.maxTotal, (n) => set(r.key, { maxTotal: n }), t("colMaxTotal"))}</td>
                <td className="py-2 text-center">{limit(r.maxPerDay, (n) => set(r.key, { maxPerDay: n }), t("colMaxDay"))}</td>
                <td className="py-2 text-center">{limit(r.maxPerMonth, (n) => set(r.key, { maxPerMonth: n }), t("colMaxMonth"))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const r = await send("/api/admin/points/rules", "PUT", {
              rules: rows.map(({ key, points, enabled, maxTotal, maxPerDay, maxPerMonth }) => ({ key, points, enabled, maxTotal, maxPerDay, maxPerMonth })),
            });
            setBusy(false);
            setMsg(r.ok ? t("saved") : (r.error ?? t("error")));
            if (r.ok) router.refresh();
          }}
          className={ui.buttonPrimary}
        >
          {t("saveRules")}
        </button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </div>
  );
}

/** Add or take away points by hand, always with a reason (kept in their history). */
export function AdjustPoints({ userId, name }: { userId: string; name: string }) {
  const t = useTranslations("AdminPoints");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={ui.link + " text-xs"}>
        {t("adjust")}
      </button>
    );
  }
  return (
    <form
      className="flex flex-col items-end gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await send("/api/admin/points/adjust", "POST", { userId, points: Math.trunc(Number(points)), reason });
        setMsg(r.ok ? t("saved") : (r.error ?? t("error")));
        if (r.ok) {
          setOpen(false);
          setPoints("");
          setReason("");
          router.refresh();
        }
      }}
    >
      <span className="text-xs text-muted">{t("adjustFor", { name })}</span>
      <input type="number" required value={points} onChange={(e) => setPoints(e.target.value)} placeholder={t("adjustPoints")} aria-label={t("adjustPoints")} className={ui.input + " w-32 py-1.5!"} />
      <input required minLength={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("adjustReason")} aria-label={t("adjustReason")} className={ui.input + " w-48 py-1.5!"} />
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className={ui.buttonSecondary + " py-1.5!"}>
          {t("cancel")}
        </button>
        <button type="submit" className={ui.buttonPrimary + " py-1.5!"}>
          {t("apply")}
        </button>
      </div>
      {msg && <span className="text-xs text-danger">{msg}</span>}
    </form>
  );
}
