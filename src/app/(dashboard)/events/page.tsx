"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/hooks/useI18n";
import { Card, CardContent } from "@/components/ui/card";
import {
  Trophy,
  Building2,
  GraduationCap,
  Users,
  CalendarDays,
  MapPin,
  Clock,
  Dumbbell,
  RefreshCw,
  Award,
  Hourglass,
  CheckCircle2,
  Sparkles,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SectionKey = "events" | "facilities" | "classes";

interface EventItem {
  id: string;
  number?: number;
  name?: string;
  type?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  status?: string;
  fee?: string;
  prize?: string;
  notes?: string;
  count?: number;
  max?: number;
  isRegistered?: boolean;
  isOnWaitingList?: boolean;
}

interface FacilityItem {
  id: string;
  number?: number;
  name?: string;
  type?: string;
  date?: string;
  period?: string;
  capacity?: number;
  currentCount?: number;
  available?: number;
  isBookedByMe?: boolean;
  isOnWaitingList?: boolean;
}

interface ClassItem {
  id: string;
  name?: string;
  level?: string;
  days?: string[];
  startTime?: string;
  endTime?: string;
  duration?: number;
  trainerName?: string;
  courseStart?: string;
  courseEnd?: string;
  sessionsPerWeek?: number;
  capacity?: number;
  currentCount?: number;
  remaining?: number;
  status?: string;
  courseStatus?: string;
  isJoined?: boolean;
  isOnWaitingList?: boolean;
}

interface PageData {
  events: EventItem[];
  facilities: FacilityItem[];
  classes: ClassItem[];
  registration?: { tableExists: boolean; waitingListExists: boolean };
}

const SECTIONS: { key: SectionKey; icon: typeof Trophy; labelKey: string }[] = [
  { key: "events", icon: Trophy, labelKey: "events.tabEvents" },
  { key: "facilities", icon: Building2, labelKey: "events.tabFacilities" },
  { key: "classes", icon: GraduationCap, labelKey: "events.tabClasses" },
];

export default function EventsPage() {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [section, setSection] = useState<SectionKey>("events");
  const [filters, setFilters] = useState<Record<SectionKey, string>>({
    events: "all",
    facilities: "all",
    classes: "all",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    kind: "success" | "error";
  } | null>(null);

  const fetchPage = useCallback(async (): Promise<PageData> => {
    const res = await fetch("/api/events/page", { credentials: "same-origin" });
    if (!res.ok) throw new Error("Failed");
    const json = await res.json();
    if (!json?.data) throw new Error("Bad payload");
    return json.data as PageData;
  }, []);

  const refresh = useCallback(async () => {
    setData(await fetchPage());
  }, [fetchPage]);

  const handleAction = useCallback(
    async (
      endpoint: "/api/events",
      bodyKey: "eventId",
      id: string,
      method: "POST" | "DELETE",
      copy: { notRegistered: string; regSuccess: string; waitingListSuccess: string }
    ) => {
      setBusyId(id);
      setNotice(null);
      try {
        const res = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [bodyKey]: id }),
          credentials: "same-origin",
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const apiMsg = json?.message;
          const msg =
            apiMsg === "Already registered"
              ? t("events.alreadyRegistered")
              : apiMsg === "Already on the waiting list"
                ? t("events.alreadyOnWaitingList")
                : typeof apiMsg === "string" && apiMsg.startsWith("You're not registered")
                  ? copy.notRegistered
                  : apiMsg || t("events.error");
          throw new Error(msg);
        }
        const resData = json?.data;

        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            events: prev.events.map((e) => {
              if (e.id !== id) return e;
              if (method === "POST") {
                if (resData?.waitingList) {
                  return { ...e, isOnWaitingList: true, isRegistered: false };
                }
                const cur = Number(e.count || 0);
                return {
                  ...e,
                  isRegistered: true,
                  isOnWaitingList: false,
                  count: cur + 1,
                };
              } else {
                const wasReg = Boolean(e.isRegistered);
                const cur = Number(e.count || 0);
                return {
                  ...e,
                  isRegistered: false,
                  isOnWaitingList: false,
                  count: wasReg ? Math.max(0, cur - 1) : cur,
                };
              }
            }),
          };
        });

        if (method === "POST") {
          setNotice({
            text: resData?.waitingList ? copy.waitingListSuccess : copy.regSuccess,
            kind: "success",
          });
        } else {
          setNotice({
            text: resData?.removedFromWaitingList
              ? t("events.waitingListLeft")
              : resData?.autoPromoted
                ? t("events.promotedSuccess")
                : t("events.cancelSuccess"),
            kind: "success",
          });
        }
      } catch (err) {
        setNotice({
          text: err instanceof Error ? err.message : t("events.error"),
          kind: "error",
        });
      } finally {
        setBusyId(null);
      }
    },
    [t]
  );

  const handleEventAction = useCallback(
    (eventId: string, method: "POST" | "DELETE") =>
      handleAction("/api/events", "eventId", eventId, method, {
        notRegistered: t("events.notRegistered"),
        regSuccess: t("events.regSuccess"),
        waitingListSuccess: t("events.waitingListSuccess"),
      }),
    [handleAction, t]
  );

  const handleFacilityAction = useCallback(
    async (bookingId: string, action: "book" | "cancel") => {
      setBusyId(bookingId);
      setNotice(null);
      try {
        const res = await fetch(
          action === "book"
            ? "/api/facility-bookings"
            : `/api/facility-bookings/${bookingId}`,
          {
            method: action === "book" ? "POST" : "DELETE",
            headers:
              action === "book"
                ? { "Content-Type": "application/json" }
                : undefined,
            credentials: "same-origin",
            body: action === "book" ? JSON.stringify({ bookingId }) : undefined,
          }
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const apiMsg = json?.message;
          const msg =
            apiMsg === "Already booked"
              ? t("facilities.alreadyBooked")
              : apiMsg === "Already on the waiting list"
                ? t("events.alreadyOnWaitingList")
                : apiMsg === "Slot is full"
                  ? t("facilities.capacityFull")
                  : t("facilities.error");
          throw new Error(msg);
        }
        const resData = json?.data;

        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            facilities: prev.facilities.map((f) => {
              if (f.id !== bookingId) return f;
              if (action === "book") {
                if (resData?.waitingList) {
                  return { ...f, isOnWaitingList: true, isBookedByMe: false };
                }
                const cur = Number(f.currentCount || 0);
                const cap = Number(f.capacity || 0);
                return {
                  ...f,
                  isBookedByMe: true,
                  isOnWaitingList: false,
                  currentCount: cur + 1,
                  available: cap > 0 ? Math.max(0, cap - (cur + 1)) : f.available,
                };
              } else {
                const wasBooked = Boolean(f.isBookedByMe);
                const cur = Number(f.currentCount || 0);
                const cap = Number(f.capacity || 0);
                const newCount = wasBooked ? Math.max(0, cur - 1) : cur;
                return {
                  ...f,
                  isBookedByMe: false,
                  isOnWaitingList: false,
                  currentCount: newCount,
                  available: cap > 0 ? Math.max(0, cap - newCount) : f.available,
                };
              }
            }),
          };
        });

        if (action === "book") {
          setNotice({
            text: resData?.waitingList
              ? t("events.waitingListSuccess")
              : t("events.facilityRegSuccess"),
            kind: "success",
          });
        } else {
          setNotice({
            text: resData?.removedFromWaitingList
              ? t("events.waitingListLeft")
              : resData?.autoPromoted
                ? t("events.promotedSuccess")
                : t("events.cancelSuccess"),
            kind: "success",
          });
        }
      } catch (err) {
        setNotice({
          text: err instanceof Error ? err.message : t("facilities.error"),
          kind: "error",
        });
      } finally {
        setBusyId(null);
      }
    },
    [t]
  );

  const handleClassAction = useCallback(
    async (classId: string, action: "join" | "cancel") => {
      setBusyId(classId);
      setNotice(null);
      try {
        const res = await fetch(
          action === "join" ? "/api/classes" : `/api/classes/${classId}`,
          {
            method: action === "join" ? "POST" : "DELETE",
            headers:
              action === "join"
                ? { "Content-Type": "application/json" }
                : undefined,
            credentials: "same-origin",
            body: action === "join" ? JSON.stringify({ classId }) : undefined,
          }
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const apiMsg = json?.message;
          const msg =
            apiMsg === "Already registered" || apiMsg === "Already joined this class"
              ? t("events.alreadyRegistered")
              : apiMsg === "Already on the waiting list"
                ? t("events.alreadyOnWaitingList")
                : apiMsg || t("events.error");
          throw new Error(msg);
        }
        const resData = json?.data;

        // Directly apply the verified server state to the UI without stale fetchPage overwrite
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            classes: prev.classes.map((c) => {
              if (c.id !== classId) return c;
              return {
                ...c,
                isJoined: Boolean(resData?.isJoined),
                isOnWaitingList: Boolean(resData?.isOnWaitingList ?? resData?.waitingList),
                currentCount:
                  typeof resData?.currentCount === "number"
                    ? resData.currentCount
                    : c.currentCount,
                remaining:
                  typeof resData?.remaining === "number"
                    ? resData.remaining
                    : c.remaining,
              };
            }),
          };
        });

        if (action === "join") {
          setNotice({
            text: resData?.waitingList
              ? t("events.waitingListSuccess")
              : (isAr ? "تم الانضمام إلى الكلاس بنجاح!" : "Successfully joined class!"),
            kind: "success",
          });
        } else {
          setNotice({
            text: resData?.removedFromWaitingList
              ? t("events.waitingListLeft")
              : resData?.autoPromoted
                ? t("events.promotedSuccess")
                : (isAr ? "تم إلغاء التسجيل في الكلاس" : "Class registration cancelled"),
            kind: "success",
          });
        }
      } catch (err) {
        setNotice({
          text: err instanceof Error ? err.message : t("events.error"),
          kind: "error",
        });
      } finally {
        setBusyId(null);
      }
    },
    [refresh, t, isAr]
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const handleRetry = async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await fetchPage());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const categories = useMemo(() => {
    const cats: Record<SectionKey, string[]> = {
      events: [],
      facilities: [],
      classes: [],
    };
    for (const e of data?.events ?? [])
      if (e.type && !cats.events.includes(e.type)) cats.events.push(e.type);
    for (const f of data?.facilities ?? [])
      if (f.type && !cats.facilities.includes(f.type))
        cats.facilities.push(f.type);
    for (const c of data?.classes ?? [])
      if (c.level && !cats.classes.includes(c.level)) cats.classes.push(c.level);
    return cats;
  }, [data]);

  const filteredEvents = useMemo(() => {
    const list = data?.events ?? [];
    const f = filters.events;
    return f === "all" ? list : list.filter((e) => e.type === f);
  }, [data, filters.events]);

  const filteredFacilities = useMemo(() => {
    const list = data?.facilities ?? [];
    const f = filters.facilities;
    return f === "all" ? list : list.filter((x) => x.type === f);
  }, [data, filters.facilities]);

  const filteredClasses = useMemo(() => {
    const list = data?.classes ?? [];
    const f = filters.classes;
    return f === "all" ? list : list.filter((c) => c.level === f);
  }, [data, filters.classes]);

  const sectionIcon =
    SECTIONS.find((s) => s.key === section)?.icon ?? Trophy;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Desktop Hero Banner (>= lg) */}
      <div className="hidden lg:block relative overflow-hidden rounded-3xl bg-card border border-border/80 p-6 shadow-sm">
        <div className="relative z-10 flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-bold bg-primary text-primary-foreground border border-primary/25">
              <Trophy className="w-3.5 h-3.5" />
              {isAr ? "الفعاليات والمرافق الرياضية" : "Events, Facilities & Classes"}
            </div>
            <h1 className="text-3xl font-black text-foreground tracking-tight">
              {t("events.title")}
            </h1>
            <p className="text-sm text-foreground/70">
              {isAr
                ? "احجز حصصك في الكلاسات، مسابح وملاعب النادي، وشارك في التحديات والبطولات الرياضية."
                : "Reserve spots in gym classes, facilities, and join competitions & events."}
            </p>
          </div>
        </div>
      </div>

      {/* Mobile Header (< lg) */}
      <div className="block lg:hidden">
        <h1 className="text-2xl font-bold text-foreground">{t("events.title")}</h1>
        <p className="text-sm text-foreground/70 mt-1">{t("events.subtitle")}</p>
      </div>

      {/* Top-level section switcher */}
      <div className="grid grid-cols-3 gap-1.5 bg-card border border-border rounded-2xl p-1.5">
        {SECTIONS.map(({ key, icon: Icon, labelKey }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all cursor-pointer",
              section === key
                ? "bg-accent text-accent-foreground"
                : "text-foreground/70 hover:text-foreground hover:bg-card-hover"
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{t(labelKey)}</span>
          </button>
        ))}
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilters((f) => ({ ...f, [section]: "all" }))}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-semibold border transition-all cursor-pointer",
            filters[section] === "all"
              ? "bg-accent text-accent-foreground border-accent"
              : "bg-card border-border text-foreground/70 hover:text-foreground"
          )}
        >
          {t("events.all")}
        </button>
        {categories[section].map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() =>
              setFilters((f) => ({ ...f, [section]: cat }))
            }
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-semibold border transition-all cursor-pointer",
              filters[section] === cat
                ? "bg-accent text-accent-foreground border-accent"
                : "bg-card border-border text-foreground/70 hover:text-foreground"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Action feedback */}
      {notice && (
        <div
          className={cn(
            "rounded-2xl p-4 flex items-center gap-3 animate-fade-in border",
            notice.kind === "success"
              ? "bg-success/10 border-success/20"
              : "bg-red-500/10 border-red-500/20"
          )}
        >
          <CheckCircle2
            className={cn(
              "w-5 h-5 shrink-0",
              notice.kind === "success" ? "text-success" : "text-red-400"
            )}
          />
          <p
            className={cn(
              "font-bold text-sm flex-1",
              notice.kind === "success" ? "text-success" : "text-red-400"
            )}
          >
            {notice.text}
          </p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label={t("events.retry")}
            className="text-foreground/70 hover:text-foreground cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-foreground/70 text-center max-w-sm">{t("events.error")}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="flex items-center gap-2 rounded-xl bg-accent text-accent-foreground font-bold text-sm px-4 py-2.5 hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              {t("events.retry")}
            </button>
          </CardContent>
        </Card>
      ) : section === "events" && filteredEvents.length === 0 ? (
        <EmptyState icon={sectionIcon} label={t("events.empty")} />
      ) : section === "facilities" && filteredFacilities.length === 0 ? (
        <EmptyState icon={sectionIcon} label={t("events.empty")} />
      ) : section === "classes" && filteredClasses.length === 0 ? (
        <EmptyState icon={sectionIcon} label={t("events.empty")} />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {section === "events" &&
            filteredEvents.map((e) => (
              <EventCard
                key={e.id}
                item={e}
                busy={busyId === e.id}
                onJoin={() => handleEventAction(e.id, "POST")}
                onCancel={() => handleEventAction(e.id, "DELETE")}
              />
            ))}
          {section === "facilities" &&
            filteredFacilities.map((f) => (
              <FacilityCard
                key={f.id}
                item={f}
                busy={busyId === f.id}
                onJoin={() => handleFacilityAction(f.id, "book")}
                onCancel={() => handleFacilityAction(f.id, "cancel")}
              />
            ))}
          {section === "classes" &&
            filteredClasses.map((c) => (
              <ClassCard
                key={c.id}
                item={c}
                busy={busyId === c.id}
                onJoin={() => handleClassAction(c.id, "join")}
                onCancel={() => handleClassAction(c.id, "cancel")}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  label,
}: {
  icon: typeof Trophy;
  label: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
          <Icon className="w-8 h-8 text-accent" />
        </div>
        <p className="text-foreground/70 text-sm max-w-sm text-center">{label}</p>
      </CardContent>
    </Card>
  );
}

function CategoryBadge({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-2xs font-bold bg-primary text-primary-foreground">
      {label}
    </span>
  );
}

function StatusBadge({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-2xs font-semibold bg-card-hover border border-border text-foreground/70">
      {label}
    </span>
  );
}

function formatEventDate(raw: unknown, locale: string): string {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? new Date(`${s}T00:00:00`)
    : new Date(s);
  if (isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function formatEventTime(raw: unknown, locale: string): string {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  const d = iso
    ? new Date(
        Number(iso[1]),
        Number(iso[2]) - 1,
        Number(iso[3]),
        Number(iso[4]),
        Number(iso[5]),
        iso[6] ? Number(iso[6]) : 0
      )
    : new Date(s);
  if (isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function CapacityBar({ current, max }: { current?: number; max?: number }) {
  const { t } = useI18n();
  const cur = Number(current ?? 0);
  const total = Number(max ?? 0);
  const pct = total > 0 ? Math.min(100, Math.round((cur / total) * 100)) : 0;
  const full = total > 0 && cur >= total;
  return (
    <div>
      <div className="flex items-center justify-between text-2xs font-semibold mb-1.5">
        <span className="text-foreground/70 flex items-center gap-1">
          <Users className="w-3 h-3" />
          {cur} / {total}
        </span>
        <span className={full ? "text-red-400" : "text-accent"}>
          {full
            ? t("events.full")
            : t("events.placesLeft", {
                remaining: String(Math.max(0, total - cur)),
                total: String(total),
              })}
        </span>
      </div>
      <div className="h-1.5 w-full bg-border/60 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            full ? "bg-red-500" : "bg-accent"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ClassJoinControl({
  joined,
  onWaitingList,
  full,
  busy,
  onJoin,
  onCancel,
}: {
  joined: boolean;
  onWaitingList: boolean;
  full: boolean;
  busy?: boolean;
  onJoin: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  if (busy) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-card-hover border border-border text-foreground/70 text-xs font-bold px-3 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t("events.loading")}
      </span>
    );
  }
  if (joined) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary border border-primary/30 text-primary-foreground text-xs font-bold px-3 py-2">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t("events.joined")}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-xl bg-card-hover border border-border text-foreground/70 text-xs font-bold px-2.5 py-2 hover:text-red-400 hover:border-red-400/40 transition-colors cursor-pointer"
        >
          {t("events.cancelRegistration")}
        </button>
      </div>
    );
  }
  if (onWaitingList) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-bold px-3 py-2">
          <Hourglass className="w-3.5 h-3.5" />
          {t("events.onWaitingList")}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-xl bg-card-hover border border-border text-foreground/70 text-xs font-bold px-2.5 py-2 hover:text-red-400 hover:border-red-400/40 transition-colors cursor-pointer"
        >
          {t("events.leaveWaitingList")}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onJoin}
      title={full ? t("events.joinWaitingList") : t("events.join")}
      className="inline-flex items-center gap-1.5 rounded-xl bg-accent text-accent-foreground text-xs font-bold px-3 py-2 hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer"
    >
      {full ? (
        <Hourglass className="w-3.5 h-3.5" />
      ) : (
        <Users className="w-3.5 h-3.5" />
      )}
      {full ? t("events.joinWaitingList") : t("events.join")}
    </button>
  );
}

function EventJoinControl({
  joined,
  onWaitingList,
  full,
  busy,
  onJoin,
  onCancel,
}: {
  joined: boolean;
  onWaitingList: boolean;
  full: boolean;
  busy?: boolean;
  onJoin: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  if (busy) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-card-hover border border-border text-foreground/70 text-xs font-bold px-3 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t("events.loading")}
      </span>
    );
  }
  if (joined) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary border border-primary/30 text-primary-foreground text-xs font-bold px-3 py-2">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t("events.joined")}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-xl bg-card-hover border border-border text-foreground/70 text-xs font-bold px-2.5 py-2 hover:text-red-400 hover:border-red-400/40 transition-colors cursor-pointer"
        >
          {t("events.cancelRegistration")}
        </button>
      </div>
    );
  }
  if (onWaitingList) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-bold px-3 py-2">
          <Hourglass className="w-3.5 h-3.5" />
          {t("events.onWaitingList")}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-xl bg-card-hover border border-border text-foreground/70 text-xs font-bold px-2.5 py-2 hover:text-red-400 hover:border-red-400/40 transition-colors cursor-pointer"
        >
          {t("events.leaveWaitingList")}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onJoin}
      title={full ? t("events.joinWaitingList") : t("events.join")}
      className="inline-flex items-center gap-1.5 rounded-xl bg-accent text-accent-foreground text-xs font-bold px-3 py-2 hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer"
    >
      {full ? (
        <Hourglass className="w-3.5 h-3.5" />
      ) : (
        <Users className="w-3.5 h-3.5" />
      )}
      {full ? t("events.joinWaitingList") : t("events.join")}
    </button>
  );
}

function Meta({
  icon: Icon,
  children,
}: {
  icon: typeof Clock;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5 text-2xs text-foreground/70 min-w-0">
      <Icon className="w-3 h-3 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function EventCard({
  item,
  busy,
  onJoin,
  onCancel,
}: {
  item: EventItem;
  busy?: boolean;
  onJoin: () => void;
  onCancel: () => void;
}) {
  const { t, locale } = useI18n();
  const feeNum = Number(String(item.fee ?? "").replace(/[^\d.-]/g, ""));
  const max = Number(item.max ?? 0);
  const full = max > 0 && Number(item.count ?? 0) >= max;
  const statusKey =
    item.status === "مكتملة"
      ? "events.status_completed"
      : item.status?.includes("قادم")
        ? "events.status_upcoming"
        : item.status?.includes("ملغ")
          ? "events.status_cancelled"
          : null;
  return (
    <Card className="p-5 flex flex-col gap-3 animate-fade-in">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <CategoryBadge label={item.type} />
          {statusKey && <StatusBadge label={t(statusKey)} />}
        </div>
      </div>

      <h3 className="font-bold text-foreground leading-snug">{item.name || "—"}</h3>

      {item.notes && (
        <p className="text-sm text-foreground/70 leading-relaxed line-clamp-2">
          {item.notes}
        </p>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {(item.date || item.startTime) && (
          <Meta icon={CalendarDays}>
            {[
              formatEventDate(item.date, locale),
              item.startTime && item.endTime
                ? `${formatEventTime(item.startTime, locale)} - ${formatEventTime(
                    item.endTime,
                    locale
                  )}`
                : formatEventTime(item.startTime, locale),
            ]
              .filter(Boolean)
              .join(" · ")}
          </Meta>
        )}
        {item.location && <Meta icon={MapPin}>{item.location}</Meta>}
        {item.prize && <Meta icon={Award}>{item.prize}</Meta>}
        {item.fee && (
          <Meta icon={Sparkles}>
            {feeNum === 0 ? t("events.free") : item.fee}
          </Meta>
        )}
      </div>

      <div className="mt-auto pt-2 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <CapacityBar current={item.count} max={item.max} />
        </div>
        <EventJoinControl
          joined={Boolean(item.isRegistered)}
          onWaitingList={Boolean(item.isOnWaitingList)}
          full={full}
          busy={busy}
          onJoin={onJoin}
          onCancel={onCancel}
        />
      </div>
    </Card>
  );
}

function FacilityJoinControl({
  booked,
  onWaitingList,
  full,
  busy,
  onJoin,
  onCancel,
}: {
  booked: boolean;
  onWaitingList?: boolean;
  full: boolean;
  busy?: boolean;
  onJoin: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  if (busy) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-card-hover border border-border text-foreground/70 text-xs font-bold px-3 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t("events.loading")}
      </span>
    );
  }
  if (booked) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary border border-primary/30 text-primary-foreground text-xs font-bold px-3 py-2">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t("facilities.booked")}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-xl bg-card-hover border border-border text-foreground/70 text-xs font-bold px-2.5 py-2 hover:text-red-400 hover:border-red-400/40 transition-colors cursor-pointer"
        >
          {t("common.cancel")}
        </button>
      </div>
    );
  }
  if (onWaitingList) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-bold px-3 py-2">
          <Hourglass className="w-3.5 h-3.5" />
          {t("events.onWaitingList")}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-xl bg-card-hover border border-border text-foreground/70 text-xs font-bold px-2.5 py-2 hover:text-red-400 hover:border-red-400/40 transition-colors cursor-pointer"
        >
          {t("events.leaveWaitingList")}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onJoin}
      title={full ? t("events.joinWaitingList") : t("facilities.book")}
      className="inline-flex items-center gap-1.5 rounded-xl bg-accent text-accent-foreground text-xs font-bold px-3 py-2 hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer"
    >
      {full ? (
        <Hourglass className="w-3.5 h-3.5" />
      ) : (
        <Users className="w-3.5 h-3.5" />
      )}
      {full ? t("events.joinWaitingList") : t("facilities.book")}
    </button>
  );
}

function FacilityCard({
  item,
  busy,
  onJoin,
  onCancel,
}: {
  item: FacilityItem;
  busy?: boolean;
  onJoin: () => void;
  onCancel: () => void;
}) {
  const { locale } = useI18n();
  const capacity = Number(item.capacity ?? 0);
  const full =
    capacity > 0 &&
    Number(item.currentCount ?? 0) >= capacity &&
    !item.isBookedByMe;
  return (
    <Card className="p-5 flex flex-col gap-3 animate-fade-in">
      <div className="flex items-start justify-between gap-2">
        <CategoryBadge label={item.type} />
      </div>

      <h3 className="font-bold text-foreground leading-snug">{item.name || "—"}</h3>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {item.date && (
          <Meta icon={CalendarDays}>{formatEventDate(item.date, locale)}</Meta>
        )}
        {item.period && (
          <Meta icon={Clock}>
            <span dir="ltr">{item.period}</span>
          </Meta>
        )}
      </div>

      <div className="mt-auto pt-2 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <CapacityBar current={item.currentCount} max={item.capacity} />
        </div>
        <FacilityJoinControl
          booked={Boolean(item.isBookedByMe)}
          onWaitingList={Boolean(item.isOnWaitingList)}
          full={full}
          busy={busy}
          onJoin={onJoin}
          onCancel={onCancel}
        />
      </div>
    </Card>
  );
}

function ClassCard({
  item,
  busy,
  onJoin,
  onCancel,
}: {
  item: ClassItem;
  busy?: boolean;
  onJoin: () => void;
  onCancel: () => void;
}) {
  const { t, locale } = useI18n();
  const capacity = Number(item.capacity ?? 0);
  const full =
    capacity > 0 &&
    Number(item.currentCount ?? 0) >= capacity &&
    !item.isJoined;

  return (
    <Card className="p-5 flex flex-col gap-3 animate-fade-in">
      <div className="flex items-start justify-between gap-2">
        <CategoryBadge label={item.level} />
        {item.courseStatus && <StatusBadge label={item.courseStatus} />}
      </div>

      <h3 className="font-bold text-foreground leading-snug">{item.name || "—"}</h3>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {Array.isArray(item.days) && item.days.length > 0 && (
          <Meta icon={CalendarDays}>{item.days.join("، ")}</Meta>
        )}
        {(item.startTime || item.endTime) && (
          <Meta icon={Clock}>
            {item.startTime}
            {item.endTime ? ` - ${item.endTime}` : ""}
          </Meta>
        )}
        {item.trainerName && <Meta icon={Dumbbell}>{item.trainerName}</Meta>}
        {item.duration && (
          <Meta icon={Hourglass}>
            {item.duration} {t("events.durationMinutes")}
          </Meta>
        )}
        {(item.courseStart || item.courseEnd) && (
          <Meta icon={Sparkles}>
            {[
              formatEventDate(item.courseStart, locale),
              formatEventDate(item.courseEnd, locale),
            ]
              .filter(Boolean)
              .join(" → ")}
          </Meta>
        )}
        {item.sessionsPerWeek && (
          <Meta icon={Users}>
            {item.sessionsPerWeek} {t("events.sessionsPerWeek")}
          </Meta>
        )}
      </div>

      <div className="mt-auto pt-2 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <CapacityBar current={item.currentCount} max={item.capacity} />
        </div>
        <ClassJoinControl
          joined={Boolean(item.isJoined)}
          onWaitingList={Boolean(item.isOnWaitingList)}
          full={full}
          busy={busy}
          onJoin={onJoin}
          onCancel={onCancel}
        />
      </div>
    </Card>
  );
}
