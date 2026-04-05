import { Suspense } from "react";
import SuchePage from "./SuchePage";

function SucheSkeleton() {
  return (
    <div className="p-6 lg:p-10 animate-pulse space-y-4">
      <div className="h-8 w-48 rounded-xl bg-[var(--bg-subtle)]" />
      <div className="h-12 w-full rounded-xl bg-[var(--bg-subtle)]" />
      <div className="flex gap-4">
        <div className="hidden lg:block h-64 w-64 rounded-xl bg-[var(--bg-subtle)] flex-shrink-0" />
        <div className="flex-1 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 w-full rounded-xl bg-[var(--bg-subtle)]" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SucheRoute() {
  return (
    <Suspense fallback={<SucheSkeleton />}>
      <SuchePage />
    </Suspense>
  );
}
