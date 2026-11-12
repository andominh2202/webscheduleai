export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse" role="status" aria-label="Đang tải trang">
      <div className="space-y-2">
        <div className="h-7 w-52 rounded bg-muted" />
        <div className="h-4 w-80 max-w-full rounded bg-muted" />
      </div>
      <div className="h-10 w-full rounded-lg bg-muted/60" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-36 rounded-xl border bg-card p-4 space-y-4">
            <div className="h-5 w-2/3 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted/70" />
            <div className="h-4 w-1/2 rounded bg-muted/70" />
          </div>
        ))}
      </div>
      <span className="sr-only">Đang tải dữ liệu...</span>
    </div>
  );
}
