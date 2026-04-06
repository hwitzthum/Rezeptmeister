import { Suspense } from "react";
import SuchePage from "./SuchePage";

function SucheSkeleton() {
  return (
    <div className="p-6 lg:p-10 space-y-4">
      <div className="skeleton h-8 w-48 rounded-xl" />
      <div className="skeleton h-12 w-full rounded-xl" />
      <div className="flex gap-4">
        <div className="hidden lg:block h-64 w-64 rounded-xl skeleton flex-shrink-0" />
        <div className="flex-1 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-20 w-full rounded-xl" />
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
