export const ui = {
  input:
    "w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted transition-colors focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 disabled:opacity-50",
  select:
    "w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-ink transition-colors focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 disabled:opacity-50",
  label: "text-sm font-medium text-ink/80",
  card: "rounded-2xl border border-border bg-surface shadow-sm",

  buttonPrimary:
    "inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
  buttonSecondary:
    "inline-flex items-center justify-center rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-border-strong hover:bg-surface-sunken active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
  buttonGhost:
    "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface-sunken hover:text-ink disabled:opacity-0",

  link: "text-primary underline decoration-primary/25 underline-offset-[3px] transition-colors hover:text-primary-hover hover:decoration-primary/60",

  pill: (active: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
      active
        ? "border-primary bg-primary text-white"
        : "border-border text-ink/70 hover:border-border-strong hover:text-ink"
    }`,
  toggleTab: (active: boolean) =>
    `flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
      active ? "bg-ink text-background" : "text-ink/55 hover:text-ink"
    }`,

  scoreTone: (score: number): "success" | "secondary" | "warning" =>
    score >= 90 ? "success" : score >= 75 ? "secondary" : "warning",
  badge: (tone: "success" | "warning" | "danger" | "secondary" | "accent" | "berry") =>
    `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
      {
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
        secondary: "bg-secondary-soft text-secondary",
        accent: "bg-accent-soft text-accent-hover",
        berry: "bg-berry-soft text-berry",
      }[tone]
    }`,

  dayChip: (available: boolean) =>
    `flex flex-col items-center justify-center rounded-lg py-1.5 text-[11px] font-semibold ${
      available ? "bg-ink text-background" : "bg-surface-sunken text-muted"
    }`,

  // Section eyebrow — small uppercase label above a heading.
  eyebrow: "text-xs font-semibold uppercase tracking-[0.14em] text-muted",
};
