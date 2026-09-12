// Simple pulsing placeholder blocks shown while data loads, instead of a
// blank page or a bare "Loading..." string.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink/10 ${className}`} />;
}

export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-4 ${c === 0 ? "w-1/4" : "flex-1"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

// A generic page-level skeleton — a title bar, a card-shaped block, and a
// few rows — used by app/(dashboard)/loading.tsx while a route's data
// fetches on first navigation.
export function PageSkeleton() {
  return (
    <div>
      <Skeleton className="h-7 w-48 mb-2" />
      <Skeleton className="h-4 w-72 mb-6" />
      <div className="card">
        <SkeletonRows rows={6} cols={4} />
      </div>
    </div>
  );
}
