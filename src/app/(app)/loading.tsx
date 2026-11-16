export default function Loading() {
  return (
    <div
      className="w-full min-h-[50vh] flex flex-col items-center justify-center space-y-4"
      role="status"
      aria-label="Đang tải dữ liệu"
    >
      <div className="h-1 w-full max-w-sm overflow-hidden rounded-full bg-muted/60">
        <div className="h-full w-1/3 rounded-full bg-primary animate-top-shimmer" />
      </div>
      <p className="text-xs text-muted-foreground animate-pulse">Đang tải...</p>
      <span className="sr-only">Đang tải dữ liệu...</span>
    </div>
  );
}
