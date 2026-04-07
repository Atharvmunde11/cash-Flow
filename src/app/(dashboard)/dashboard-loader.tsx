"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const DashboardView = dynamic(
  () =>
    import("./dashboard-view").then((m) => m.DashboardView),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    ),
  }
);

export function DashboardLoader() {
  return <DashboardView />;
}
