export const ui = {
  input:
    "w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:opacity-50",
  select:
    "w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:opacity-50",
  label: "text-sm font-medium text-ink/80",
  card: "rounded-3xl border border-border bg-surface shadow-[0_1px_2px_rgba(30,20,10,0.04),0_12px_32px_-16px_rgba(30,20,10,0.18)]",
  buttonPrimary:
    "inline-flex items-center justify-center rounded-full bg-primary text-white px-6 py-3 text-sm font-semibold shadow-sm shadow-primary/30 hover:bg-primary-hover active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none",
  buttonSecondary:
    "inline-flex items-center justify-center rounded-full border border-border bg-surface px-6 py-3 text-sm font-semibold text-ink hover:border-primary/40 hover:bg-primary-soft/40 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none",
  buttonGhost:
    "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-muted hover:text-ink transition disabled:opacity-0",
  link: "text-primary hover:text-primary-hover underline decoration-primary/30 underline-offset-4 transition-colors",
  pill: (active: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
      active
        ? "bg-primary text-white border-primary shadow-sm shadow-primary/30"
        : "border-border text-ink/70 hover:border-primary/40 hover:text-ink"
    }`,
  toggleTab: (active: boolean) =>
    `flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
      active ? "bg-ink text-background" : "text-ink/60 hover:text-ink"
    }`,
  scoreTone: (score: number): "success" | "secondary" | "warning" =>
    score >= 90 ? "success" : score >= 75 ? "secondary" : "warning",
  badge: (tone: "success" | "warning" | "danger" | "secondary" | "accent" | "berry") =>
    `inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
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
      available ? "bg-ink text-background" : "bg-border/60 text-muted"
    }`,
};
