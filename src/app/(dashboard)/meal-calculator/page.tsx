"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MealCalculatorPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/nutrition?tab=calculator");
  }, [router]);
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
    </div>
  );
}
