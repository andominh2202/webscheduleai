export default function Loading() {
  return (
    <div
      className="w-full space-y-6 pb-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Đang tải dữ liệu"
    >
      {/* Top shimmer bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted/70">
        <div className="h-full w-1/3 rounded-full bg-primary animate-top-shimmer" />
      </div>

      {/* Page header skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg skeleton-shimmer" />
          <div className="h-4 w-72 max-w-full rounded-md skeleton-shimmer opacity-80" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 rounded-lg skeleton-shimmer" />
          <div className="h-9 w-32 rounded-lg skeleton-shimmer opacity-85" />
        </div>
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-card space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-20 rounded bg-muted animate-pulse" />
              <div className="h-8 w-8 rounded-lg bg-muted/80 animate-pulse" />
            </div>
            <div className="h-7 w-14 rounded-md bg-muted animate-pulse" />
            <div className="h-3 w-28 rounded bg-muted/60 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Main content two-column skeleton */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-border/80 bg-card p-5 shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-5 w-40 rounded bg-muted animate-pulse" />
            <div className="h-4 w-24 rounded bg-muted/70 animate-pulse" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 rounded-lg border border-border/60 p-3.5"
              >
                <div className="h-10 w-1.5 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/5 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-2/5 rounded bg-muted/70 animate-pulse" />
                </div>
                <div className="h-6 w-16 rounded-full bg-muted/80 animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-card space-y-4">
          <div className="h-5 w-36 rounded bg-muted animate-pulse" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="space-y-2 rounded-lg border border-border/50 p-3">
                <div className="h-3.5 w-4/5 rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted/70 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <span className="sr-only">Đang tải dữ liệu...</span>
    </div>
  );
}
