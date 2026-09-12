// A friendlier "nothing here yet" block for empty tables/lists, used in
// place of a single plain text row. Usage inside a <table>: pass `colSpan`
// to span it across a <tr><td>; otherwise it renders as a standalone block.
export function EmptyState({
  icon = "📦",
  title,
  hint,
}: {
  icon?: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div className="text-3xl mb-2 opacity-70">{icon}</div>
      <div className="text-sm font-medium text-ink/70">{title}</div>
      {hint && <div className="text-xs text-ink/45 mt-1 max-w-xs">{hint}</div>}
    </div>
  );
}

export function EmptyRow({ colSpan, icon, title, hint }: { colSpan: number; icon?: string; title: string; hint?: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <EmptyState icon={icon} title={title} hint={hint} />
      </td>
    </tr>
  );
}
