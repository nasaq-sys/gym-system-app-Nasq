"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Card } from "@/components/ui/card";
import {
  User,
  Mail,
  Phone,
  Dumbbell,
  Calendar,
  Star,
  ShieldCheck,
  Globe,
  Sun,
  LogOut,
  Repeat,
  MessageSquareText,
  CheckCircle2,
  Sparkles,
  Award,
  FileText,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLongDate } from "@/lib/format";
import LanguageSwitch from "@/components/shared/LanguageSwitch";
import ThemeSwitch from "@/components/shared/ThemeSwitch";
import FeedbackDialog from "@/components/shared/FeedbackDialog";
import type { SessionRole } from "@/lib/auth";

interface SalaryHistoryItem {
  month: string;
  base: number;
  bonus: number;
  total: number;
  status: string;
  statusEn: string;
  paidDate: string;
}

interface TrainerProfileData {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialty: string;
  rating: number;
  salary: number;
  hireDate: string;
  contractEndDate: string;
  daysUntilRenewal: number;
  contractType: string;
  workingHours: string;
  active: boolean;
  traineesCount: number;
  sessionsCount: number;
  sessionCommissionRate: number;
  estimatedCommissions: number;
  totalEstimatedEarnings: number;
  salaryHistory: SalaryHistoryItem[];
  altRole?: SessionRole;
}

export default function TrainerProfilePage() {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";

  const [profile, setProfile] = useState<TrainerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    fetch("/api/trainer/profile", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data) setProfile(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSwitchRole = async () => {
    setSwitching(true);
    try {
      const res = await fetch("/api/auth/switch-role", { method: "POST" });
      if (!res.ok) return;
      const json = await res.json();
      const home: Record<SessionRole, string> = {
        admin: "/home",
        trainer: "/trainer",
        member: "/home",
      };
      window.location.href = home[json?.data?.role as SessionRole] || "/";
    } finally {
      setSwitching(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (typeof window !== "undefined") {
        sessionStorage.clear();
        localStorage.removeItem("ip_tracked");
      }
    } catch {}
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-9 h-9 border-3 border-border border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const name = profile?.name || (isAr ? "مدرب Nasaq Gym" : "Nasaq Gym Trainer");
  const specialty = profile?.specialty || (isAr ? "لياقة بدنية وكمال أجسام" : "Fitness & Bodybuilding");

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-20">
      {/* ── Trainer Profile Hero Banner ── */}
      <div className="relative overflow-hidden rounded-3xl bg-card border border-border/80 p-6 sm:p-8 shadow-sm">
        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6 text-center sm:text-start">
          {/* Avatar Icon */}
          <div className="relative">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-accent text-accent-foreground flex items-center justify-center font-black text-2xl sm:text-3xl shadow-md border-2 border-accent-border">
              {name.slice(0, 2).toUpperCase()}
            </div>
            <div className="absolute -bottom-1 -end-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-card flex items-center justify-center text-white" title="Active">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Trainer Info */}
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary text-primary-foreground border border-primary/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isAr ? "مدرب معتمد ومسجل" : "Certified Coach"}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight truncate">
              {name}
            </h1>

            <p className="text-sm font-semibold text-foreground/70 flex items-center justify-center sm:justify-start gap-1.5">
              <Dumbbell className="w-4 h-4 text-accent" />
              <span>{specialty}</span>
            </p>
          </div>
        </div>

        {/* ── Key Metrics Bar ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6 pt-6 border-t border-border/60">
          <div className="p-3.5 rounded-2xl bg-background/60 backdrop-blur-sm border border-border/50 text-center">
            <p className="text-xl sm:text-2xl font-black text-foreground tabular-nums">
              {profile?.traineesCount ?? 0}
            </p>
            <p className="text-xs text-foreground/70 font-medium mt-0.5">
              {isAr ? "المتدربين المشرف عليهم" : "Assigned Trainees"}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-background/60 backdrop-blur-sm border border-border/50 text-center">
            <p className="text-xl sm:text-2xl font-black text-accent tabular-nums">
              {profile?.sessionsCount ?? 0}
            </p>
            <p className="text-xs text-foreground/70 font-medium mt-0.5">
              {isAr ? "الجلسات التدريبية" : "Private Sessions"}
            </p>
          </div>

          <div className="col-span-2 sm:col-span-1 p-3.5 rounded-2xl bg-background/60 backdrop-blur-sm border border-border/50 text-center flex flex-col items-center justify-center">
            <div className="flex items-center gap-1 text-amber-400 font-black text-xl sm:text-2xl">
              <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
              <span className="tabular-nums">{profile?.rating ? profile.rating.toFixed(1) : "5.0"}</span>
            </div>
            <p className="text-xs text-foreground/70 font-medium mt-0.5">
              {isAr ? "تقييم الأداء" : "Coach Rating"}
            </p>
          </div>
        </div>
      </div>



      {/* ── 📄 2. CONTRACT & EMPLOYMENT DETAILS (معلومات العقد والتوظيف) ── */}
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 pb-2 border-b border-border/60">
          <div className="w-9 h-9 rounded-xl bg-primary/15 text-accent flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-foreground">
              {isAr ? "بيانات العقد والتوظيف الرسمي" : "Contract & Employment Details"}
            </h2>
            <p className="text-xs text-foreground/70">
              {isAr ? "تفاصيل التعاقد، تاريخ البدء والانتهاء، وساعات العمل" : "Contract type, start/end dates, and shift hours"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Contract Type */}
          <div className="p-3.5 rounded-2xl bg-card-hover border border-border/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-background flex items-center justify-center text-accent shrink-0">
              <Award className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground/70 font-medium">{isAr ? "نوع العقد" : "Contract Type"}</p>
              <p className="text-sm font-bold text-foreground truncate">
                {profile?.contractType || (isAr ? "عقد عمل سنوي معتمد" : "Annual Certified Contract")}
              </p>
            </div>
          </div>

          {/* Working Shift */}
          <div className="p-3.5 rounded-2xl bg-card-hover border border-border/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-background flex items-center justify-center text-accent shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground/70 font-medium">{isAr ? "ساعات الدوام والورديات" : "Working Hours"}</p>
              <p className="text-sm font-bold text-foreground truncate">
                {profile?.workingHours || (isAr ? "8 ساعات (الوردية المسائية)" : "8h (Evening Shift)")}
              </p>
            </div>
          </div>

          {/* Start Date */}
          <div className="p-3.5 rounded-2xl bg-card-hover border border-border/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-background flex items-center justify-center text-accent shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground/70 font-medium">{isAr ? "تاريخ بداية العقد" : "Start Date"}</p>
              <p className="text-sm font-bold text-foreground truncate">
                {profile?.hireDate ? formatLongDate(profile.hireDate, locale) : (isAr ? "01/01/2025" : "01/01/2025")}
              </p>
            </div>
          </div>

          {/* End Date & Renewal */}
          <div className="p-3.5 rounded-2xl bg-card-hover border border-border/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-background flex items-center justify-center text-emerald-400 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground/70 font-medium">{isAr ? "تاريخ انتهاء / تجديد العقد" : "Contract Renewal Date"}</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-foreground truncate">
                  {profile?.contractEndDate ? formatLongDate(profile.contractEndDate, locale) : (isAr ? "31/12/2026" : "31/12/2026")}
                </p>
                <span className="text-3xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                  {isAr ? `متبقي ${profile?.daysUntilRenewal ?? 180} يوم` : `${profile?.daysUntilRenewal ?? 180}d left`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── 📱 3. PERSONAL & CONTACT DETAILS ── */}
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 pb-2 border-b border-border/60">
          <div className="w-9 h-9 rounded-xl bg-primary/15 text-accent flex items-center justify-center">
            <User className="w-5 h-5" />
          </div>
          <h2 className="text-base font-black text-foreground">
            {isAr ? "معلومات التواصل والاعتماد" : "Contact & Accreditation"}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Email */}
          <div className="p-3.5 rounded-2xl bg-card-hover border border-border/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-background flex items-center justify-center text-accent shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground/70 font-medium">{isAr ? "البريد الإلكتروني" : "Email"}</p>
              <p className="text-sm font-bold text-foreground truncate">{profile?.email || "-"}</p>
            </div>
          </div>

          {/* Phone */}
          <div className="p-3.5 rounded-2xl bg-card-hover border border-border/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-background flex items-center justify-center text-accent shrink-0">
              <Phone className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground/70 font-medium">{isAr ? "رقم الهاتف" : "Phone Number"}</p>
              <p className="text-sm font-bold text-foreground truncate" dir="ltr">{profile?.phone || "-"}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* ── ⚙️ 4. APP SETTINGS (Language & Theme & Push) ── */}
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 pb-2 border-b border-border/60">
          <div className="w-9 h-9 rounded-xl bg-primary/15 text-accent flex items-center justify-center">
            <Globe className="w-5 h-5" />
          </div>
          <h2 className="text-base font-black text-foreground">
            {isAr ? "إعدادات التطبيق والمظهر" : "App Settings & Appearance"}
          </h2>
        </div>

        <div className="space-y-3">
          {/* Language Switcher */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-card-hover border border-border/60">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-background flex items-center justify-center text-accent">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{isAr ? "لغة التطبيق" : "App Language"}</p>
                <p className="text-xs text-foreground/70">
                  {locale === "ar" ? "اللغة الحالية: العربية" : "Current Language: English"}
                </p>
              </div>
            </div>
            <LanguageSwitch size="md" />
          </div>

          {/* Theme Switcher */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-card-hover border border-border/60">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-background flex items-center justify-center text-accent">
                <Sun className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{isAr ? "مظهر النظام" : "System Theme"}</p>
                <p className="text-xs text-foreground/70">
                  {isAr ? "داكن / فاتح / حسب إعداد جهازك" : "Dark / Light / Device System"}
                </p>
              </div>
            </div>
            <ThemeSwitch size="md" />
          </div>


        </div>
      </Card>

      {/* ── 🚪 5. ACTIONS & LOGOUT ── */}
      <Card className="p-5 sm:p-6 space-y-3">
        {profile?.altRole && (
          <button
            type="button"
            onClick={handleSwitchRole}
            disabled={switching}
            className="flex items-center justify-center gap-2 w-full p-3.5 rounded-2xl bg-primary text-primary-foreground border border-primary/30 font-bold text-sm hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50"
          >
            <Repeat className="w-4 h-4" />
            <span>{isAr ? "التبديل إلى لوحة الإدارة ⇄" : "Switch to Admin Console ⇄"}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="flex items-center justify-center gap-2 w-full p-3.5 rounded-2xl bg-card-hover border border-border/80 font-bold text-sm text-foreground hover:border-primary/50 transition-all cursor-pointer"
        >
          <MessageSquareText className="w-4 h-4 text-accent" />
          <span>{isAr ? "إرسال ملاحظة أو اقتراح للإدارة" : "Send Feedback to Management"}</span>
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center justify-center gap-2 w-full p-3.5 rounded-2xl bg-destructive/15 text-destructive border border-destructive/30 font-bold text-sm hover:bg-destructive/25 transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>{isAr ? "تسجيل الخروج من الحساب" : "Log Out"}</span>
        </button>
      </Card>

      {feedbackOpen && (
        <FeedbackDialog open onClose={() => setFeedbackOpen(false)} />
      )}
    </div>
  );
}
