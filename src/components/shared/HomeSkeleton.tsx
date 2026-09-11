"use client";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomeSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      {/* Header Skeleton */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 min-w-0 flex-1">
          <Skeleton className="h-7 w-48 max-w-[60vw]" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="w-10 h-10 rounded-full shrink-0" />
      </div>

      {/* Hero Stat Row Skeleton */}
      <div className="grid gap-4 md:items-stretch md:grid-cols-2">
        <Card className="h-28 md:h-[160px] flex flex-col justify-between p-4 md:p-5">
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-10 w-16" />
        </Card>

        <Card className="h-28 md:h-[160px] flex flex-col justify-between p-4 md:p-5">
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-8 w-32" />
        </Card>
      </div>

      {/* Attendance Calendar Skeleton */}
      <Card className="h-44 flex flex-col justify-between p-4 md:p-5">
        <Skeleton className="h-5 w-28" />
        <div className="grid grid-cols-7 gap-2 my-auto">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      </Card>

      {/* Quick Stats Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-muted/30 rounded-xl p-3 h-20 flex flex-col items-center justify-center gap-1.5 border border-border/60"
              >
                <Skeleton className="w-4 h-4 rounded" />
                <Skeleton className="w-12 h-3" />
                <Skeleton className="w-10 h-4" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
