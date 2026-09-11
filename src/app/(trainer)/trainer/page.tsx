"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Phone,
  ChevronLeft,
  ChevronRight,
  Users,
  Lock,
  UserCheck,
  Sparkles,
  CalendarDays,
  ShieldCheck,
  Dumbbell,
  Clock,
  ExternalLink,
  Flame,
  Award,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/hooks/useI18n";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

interface Trainee {
  id: string;
  name: string;
  phone: string;
  email: string;
  active: string;
  planType: string;
  subStatus: string;
  daysRemaining: number | null;
  isMine: boolean;
  isFree: boolean;
  category: "assigned" | "free" | "other";
}

interface TraineesResponse {
  all: Trainee[];
  assigned: Trainee[];
  free: Trainee[];
}

interface SearchResult {
  id: string;
  name: string;
  memberId: string;
  phone: string;
  planType: string;
  isMine: boolean;
  isUnassigned: boolean;
  trainerName: string;
}

function StatusBadge({ label, status }: { label?: string; status?: string }) {
  if (!label) return null;
  const isExpired = label === "منتهي" || label === "غير مشترك";
  const isActive = label === "نشط" || label === "ساري";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold border",
        isActive
          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
          : isExpired
            ? "bg-destructive/15 text-destructive border-destructive/30"
            : "bg-card-hover border-border text-foreground/70"
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          isActive ? "bg-emerald-400" : isExpired ? "bg-destructive" : "bg-muted"
        )}
      />
      {label}
    </span>
  );
}

export default function TrainerTraineesPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const Chevron = isAr ? ChevronLeft : ChevronRight;

  // Active filter tab: "assigned" | "free"
  const [activeFilter, setActiveFilter] = useState<"assigned" | "free">("assigned");

  const [traineeData, setTraineeData] = useState<TraineesResponse>({
    all: [],
    assigned: [],
    free: [],
  });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // Search state
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetch("/api/trainer/trainees", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data) {
          if (Array.isArray(res.data)) {
            setTraineeData({
              all: res.data,
              assigned: res.data,
              free: [],
            });
          } else {
            setTraineeData(res.data);
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const runSearch = useCallback((q: string) => {
    fetch(`/api/trainer/trainees/search?q=${encodeURIComponent(q)}`, {
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data) setSearchResults(res.data);
      })
      .catch(() => {})
      .finally(() => setSearching(false));
  }, []);

  const debouncedQuery = useDebouncedValue(query, 300);

  useEffect(() => {
    Promise.resolve().then(() => {
      const q = debouncedQuery.trim();
      if (!q) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      runSearch(q);
    });
  }, [debouncedQuery, runSearch]);

  const currentList = useMemo(() => {
    return activeFilter === "assigned" ? traineeData.assigned : traineeData.free;
  }, [traineeData, activeFilter]);

  // Derived metrics
  const totalAssigned = traineeData.assigned.length;
  const totalFree = traineeData.free.length;

  const activeCount = useMemo(() => {
    return currentList.filter((t) => t.subStatus === "نشط" || t.active === "نعم").length;
  }, [currentList]);

  const isSearching = query.trim().length > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-16">
      {/* ── Top Hero Banner for Trainer ── */}
      <div className="relative overflow-hidden rounded-3xl bg-card border border-border/80 p-5 sm:p-7 shadow-sm">

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary text-primary-foreground border border-primary/25">
              <Dumbbell className="w-3.5 h-3.5" />
              <span>{isAr ? "لوحة المدرب المعتمد" : "Certified Trainer Portal"}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
              {isAr ? "إدارة المتدربين والاشتراكات" : "Trainees & Subscriptions"}
            </h1>
            <p className="text-xs sm:text-sm text-foreground/70">
              {isAr
                ? "متابعة متدربي التدريب الخاص ومتدربي الاشتراكات الحرة وإعداد الجداول والأنظمة الغذائية."
                : "Manage private trainees, free subscription members, and customized plans."}
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0 bg-background/80 backdrop-blur-md p-3 rounded-2xl border border-border/60 shadow-sm w-full lg:w-auto">
            <div className="text-center px-1.5 sm:px-2">
              <p className="text-lg sm:text-xl font-black text-foreground tabular-nums">
                {totalAssigned}
              </p>
              <p className="text-3xs text-foreground/70 font-bold mt-0.5 whitespace-nowrap">
                {isAr ? "متدربيني الخاص" : "My PT"}
              </p>
            </div>
            <div className="text-center px-1.5 sm:px-2 border-x border-border/60">
              <p className="text-lg sm:text-xl font-black text-blue-400 tabular-nums">
                {totalFree}
              </p>
              <p className="text-3xs text-foreground/70 font-bold mt-0.5 whitespace-nowrap">
                {isAr ? "اشتراك حر" : "Free Plan"}
              </p>
            </div>
            <div className="text-center px-1.5 sm:px-2">
              <p className="text-lg sm:text-xl font-black text-emerald-400 tabular-nums">
                {activeCount}
              </p>
              <p className="text-3xs text-foreground/70 font-bold mt-0.5 whitespace-nowrap">
                {isAr ? "اشتراك نشط" : "Active"}
              </p>
            </div>
          </div>
        </div>

        {/* Search input inside hero container */}
        <div className="relative mt-6 pt-5 border-t border-border/50">
          <Search className="w-4 h-4 text-foreground/70 absolute top-1/2 -translate-y-1/2 start-3.5 mt-2.5" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isAr
                ? "ابحث بالاسم أو رقم الهاتف أو معرف العضو في النادي..."
                : "Search by name, phone or member ID..."
            }
            className="w-full bg-background/90 backdrop-blur-sm border border-border rounded-2xl ps-10 pe-4 py-3 text-sm text-foreground placeholder:text-foreground/70 focus:outline-none focus:border-accent focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
          />
        </div>
      </div>

      {/* ── 2 Main Trainee Category Tabs (Section Switcher) ── */}
      {!isSearching && (
        <div className="grid grid-cols-2 gap-2.5 p-1.5 bg-card/80 backdrop-blur-md rounded-2xl border border-border/80 shadow-xs">
          <button
            onClick={() => setActiveFilter("assigned")}
            className={cn(
              "flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer",
              activeFilter === "assigned"
                ? "bg-accent text-accent-foreground shadow-md scale-[1.01]"
                : "text-foreground/70 hover:text-foreground hover:bg-card-hover"
            )}
          >
            <UserCheck className="w-4 h-4" />
            <span>{isAr ? "متدربيني الخاصين (تدريب خاص)" : "My Private Trainees"}</span>
            <span className="text-2xs font-mono px-2 py-0.5 rounded-full bg-background/60 border border-border/60">
              {totalAssigned}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter("free")}
            className={cn(
              "flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer",
              activeFilter === "free"
                ? "bg-accent text-accent-foreground shadow-md scale-[1.01]"
                : "text-foreground/70 hover:text-foreground hover:bg-card-hover"
            )}
          >
            <Zap className="w-4 h-4 text-blue-400" />
            <span>{isAr ? "متدربي الاشتراك الحر" : "Free Subscription Trainees"}</span>
            <span className="text-2xs font-mono px-2 py-0.5 rounded-full bg-background/60 border border-border/60">
              {totalFree}
            </span>
          </button>
        </div>
      )}

      {/* ── Main Trainee Roster Area ── */}
      {isSearching ? (
        searching ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
          </div>
        ) : searchResults.length === 0 ? (
          <Card className="text-center py-14">
            <CardContent>
              <Search className="w-10 h-10 text-foreground/70 mx-auto mb-3 opacity-60" />
              <p className="text-sm font-semibold text-foreground">
                {isAr ? "لم نجد متدربين يطابقون بحثك" : "No matching trainees found"}
              </p>
              <p className="text-xs text-foreground/70 mt-1">
                {isAr ? "تأكد من كتابة الاسم أو الرقم بشكل صحيح" : "Check the spelling or ID"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {searchResults.map((r) => {
              const locked = !r.isMine && !r.isUnassigned;
              return (
                <div
                  key={r.id}
                  onClick={() => {
                    if (!locked) router.push(`/trainer/trainees/${r.id}`);
                  }}
                  className={cn(
                    "rounded-2xl border bg-card p-4 transition-all duration-200 flex flex-col justify-between gap-3 shadow-sm",
                    locked
                      ? "opacity-60 border-border cursor-not-allowed"
                      : "hover:border-primary/60 hover:shadow-md cursor-pointer group"
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-primary border border-primary/30 flex items-center justify-center font-bold text-primary-foreground text-sm shrink-0">
                          {r.name ? r.name.slice(0, 1) : "?"}
                        </div>
                        <div>
                          <h3 className="font-bold text-foreground group-hover:text-accent transition-colors line-clamp-1">
                            {r.name || "—"}
                          </h3>
                          <span className="text-2xs font-mono text-foreground/70">
                            #{r.memberId || r.id.slice(-6)}
                          </span>
                        </div>
                      </div>
                      {locked ? (
                        <Lock className="w-4 h-4 text-foreground/70 shrink-0" />
                      ) : (
                        <Chevron className={cn("w-4 h-4 text-foreground/70 group-hover:text-accent transition-colors shrink-0", isAr && "rotate-180")} />
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {r.isMine && <StatusBadge label={isAr ? "متدربك" : "Yours"} status="نشط" />}
                      {r.isUnassigned && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                          {isAr ? "اشتراك حر / غير مسند" : "Free Subscription"}
                        </span>
                      )}
                      {locked && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold bg-muted/15 text-foreground/70 border border-border">
                          {isAr
                            ? `مسند لـ ${r.trainerName || "مدرب آخر"}`
                            : `Assigned to ${r.trainerName || "other"}`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/50 text-xs text-foreground/70 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                    <span className="truncate min-w-0">{r.planType || "Nasaq Gym"}</span>
                    {r.phone && (
                      <span className="inline-flex items-center gap-1 font-mono text-2xs shrink-0 whitespace-nowrap">
                        <Phone className="w-3 h-3 shrink-0" />
                        <span>{r.phone}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
        </div>
      ) : currentList.length === 0 ? (
        <Card className="text-center py-14">
          <CardContent>
            <Users className="w-12 h-12 text-foreground/70 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-semibold text-foreground">
              {activeFilter === "assigned"
                ? isAr ? "لا يوجد متدربين مسندين لك حالياً" : "No private trainees assigned yet"
                : activeFilter === "free"
                  ? isAr ? "لا يوجد متدربين باشتراك حر حالياً" : "No free subscription trainees"
                  : isAr ? "لا يوجد متدربين مسجلين" : "No members found"}
            </p>
            <p className="text-xs text-foreground/70 mt-1">
              {isAr
                ? "يمكنك البحث في الشريط العلوي عن أي عضو في النادي لعرض ملفه وإعداد خطته"
                : "Search for any gym member above to view their profile and setup plans"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentList.map((t) => (
            <div
              key={t.id}
              onClick={() => router.push(`/trainer/trainees/${t.id}`)}
              className="rounded-3xl border border-border/80 bg-card p-4 sm:p-5 transition-all duration-200 flex flex-col justify-between gap-3.5 hover:border-primary/60 hover:shadow-lg cursor-pointer group"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-primary border border-primary/30 flex items-center justify-center font-bold text-primary-foreground text-base shrink-0 group-hover:scale-105 transition-transform">
                      {t.name ? t.name.slice(0, 1) : "?"}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-foreground group-hover:text-accent transition-colors truncate">
                        {t.name}
                      </h3>
                      <p className="text-xs text-foreground/70 truncate">
                        {t.planType || "Nasaq Gym Member"}
                      </p>
                    </div>
                  </div>
                  <Chevron className={cn("w-4 h-4 text-foreground/70 group-hover:text-accent transition-colors shrink-0", isAr && "rotate-180")} />
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-3.5">
                  <StatusBadge label={t.subStatus} />
                  {t.isMine ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-primary text-primary-foreground border border-primary/30">
                      <UserCheck className="w-3 h-3" />
                      {isAr ? "تدريب خاص" : "Private PT"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                      <Zap className="w-3 h-3" />
                      {isAr ? "اشتراك حر" : "Free Plan"}
                    </span>
                  )}
                  {t.daysRemaining != null && t.daysRemaining > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-card-hover border border-border text-foreground/70">
                      <Clock className="w-3 h-3" />
                      {isAr ? `متبقي ${t.daysRemaining} يوم` : `${t.daysRemaining}d left`}
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 text-xs text-foreground/70 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                {t.phone ? (
                  <span className="inline-flex items-center gap-1 font-mono text-2xs truncate min-w-0">
                    <Phone className="w-3 h-3 shrink-0" />
                    <span className="truncate">{t.phone}</span>
                  </span>
                ) : (
                  <span className="truncate min-w-0">Nasaq Gym</span>
                )}
                <span className="text-xs font-bold text-accent group-hover:underline shrink-0 whitespace-nowrap">
                  {isAr ? "عرض الملف والخطة ←" : "View Profile →"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
