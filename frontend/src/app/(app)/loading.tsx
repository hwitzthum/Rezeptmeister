export default function AppLoading() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Header skeleton */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="skeleton h-3 w-16 rounded mb-2" />
          <div className="flex items-center justify-between gap-4">
            <div className="skeleton h-7 w-48 rounded-lg" />
            <div className="skeleton h-9 w-32 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Content skeleton — card grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="rounded-2xl overflow-hidden border border-[var(--border-base)] bg-[var(--bg-surface)]"
            >
              <div className="skeleton h-48" />
              <div className="p-4 space-y-3">
                <div className="skeleton h-5 w-3/4 rounded" />
                <div className="flex gap-3">
                  <div className="skeleton h-3 w-16 rounded" />
                  <div className="skeleton h-3 w-20 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
