/**
 * Title + one-line explanation at the top of every admin page, so each
 * section says what it's for and what an admin is expected to do there.
 * `actions` sits opposite the title (filters, toggles) on wide screens.
 */
export default function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-semibold">{title}</h1>
        <p className="text-sm text-muted mt-1 max-w-xl">{description}</p>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
