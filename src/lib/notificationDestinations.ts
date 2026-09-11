// Centralized Source of Truth for Member-Facing Notification Destinations & Templates
// All routes correspond to actual pages available to members in Ultra Gym.

export interface NotificationDestination {
  id: string;
  labelAr: string;
  labelEn: string;
  url: string;
  descriptionAr: string;
  descriptionEn: string;
  iconName: string;
  category: "core" | "fitness" | "commerce" | "account" | "services";
  quickShortcut?: boolean;
}

export interface NotificationTemplate {
  id: string;
  nameAr: string;
  nameEn: string;
  titleAr: string;
  bodyAr: string;
  titleEn: string;
  bodyEn: string;
  destinationUrl: string;
  category: string;
}

export const MEMBER_NOTIFICATION_DESTINATIONS: NotificationDestination[] = [
  {
    id: "home",
    labelAr: "الصفحة الرئيسية",
    labelEn: "Home Dashboard",
    url: "/home",
    descriptionAr: "الرئيسية ونظرة عامة على الحضور والاشتراك",
    descriptionEn: "Main dashboard, attendance & subscription status",
    iconName: "LayoutDashboard",
    category: "core",
    quickShortcut: true,
  },
  {
    id: "notifications",
    labelAr: "مركز الإشعارات والصفحة الرئيسية",
    labelEn: "Notification Center",
    url: "/home",
    descriptionAr: "الرئيسية ونظرة عامة والتنبيهات",
    descriptionEn: "Home dashboard & alerts",
    iconName: "Bell",
    category: "core",
    quickShortcut: false,
  },
  {
    id: "profile",
    labelAr: "الملف الشخصي والاشتراك",
    labelEn: "Profile & Membership",
    url: "/profile",
    descriptionAr: "تفاصيل العضوية، الدفعات، طلبات تجميد الاشتراك",
    descriptionEn: "Membership info, payments & freeze requests",
    iconName: "User",
    category: "account",
    quickShortcut: true,
  },
  {
    id: "workouts",
    labelAr: "جدول التمارين الرياضية",
    labelEn: "Workout Schedule",
    url: "/workouts",
    descriptionAr: "الخطة التدريبية اليومية ومكتبة التمارين وسجل الأوزان",
    descriptionEn: "Daily workout plan, exercise library & weight logs",
    iconName: "Dumbbell",
    category: "fitness",
    quickShortcut: true,
  },
  {
    id: "nutrition",
    labelAr: "الخطة الغذائية",
    labelEn: "Nutrition Plan",
    url: "/nutrition",
    descriptionAr: "جدول التغذية والمكونات والوجبات اليومية",
    descriptionEn: "Assigned nutrition plan, daily meals & macros",
    iconName: "Apple",
    category: "fitness",
    quickShortcut: true,
  },
  {
    id: "followups",
    labelAr: "المتابعات الدورية وفحوصات InBody",
    labelEn: "Follow-ups & InBody",
    url: "/followups",
    descriptionAr: "سجل فحوصات InBody وتطور القياسات ونسبة العضلات",
    descriptionEn: "InBody scan history, muscle & body measurements",
    iconName: "LineChart",
    category: "fitness",
    quickShortcut: true,
  },
  {
    id: "shop",
    labelAr: "المتجر والمكملات الغذائية",
    labelEn: "Store & Supplements",
    url: "/shop",
    descriptionAr: "المكملات الغذائية، المنتجات الرياضية، وقائمة الكافيه",
    descriptionEn: "Supplements, gym apparel & cafe products",
    iconName: "ShoppingBag",
    category: "commerce",
    quickShortcut: true,
  },
  {
    id: "meal-calculator",
    labelAr: "حاسبة الوجبات والسعرات",
    labelEn: "Meal & Macro Calculator",
    url: "/meal-calculator",
    descriptionAr: "حساب السعرات والماكروز وتخصيص المكونات الغذائية",
    descriptionEn: "Macro calculator & personalized food portioning",
    iconName: "Calculator",
    category: "fitness",
    quickShortcut: false,
  },
  {
    id: "my-orders",
    labelAr: "طلباتي وسجل المشتريات",
    labelEn: "My Orders & Receipts",
    url: "/my-orders",
    descriptionAr: "متابعة حالة طلبات المتجر والكافيه وسجل الفواتير",
    descriptionEn: "Track store and cafe orders & purchase history",
    iconName: "ClipboardList",
    category: "commerce",
    quickShortcut: false,
  },
  {
    id: "events",
    labelAr: "الفعاليات والتحديات الرياضية",
    labelEn: "Events & Competitions",
    url: "/events",
    descriptionAr: "جدول بطولات ومسابقات وفعاليات النادي الحماسية",
    descriptionEn: "Gym tournaments, challenges & community events",
    iconName: "Calendar",
    category: "services",
    quickShortcut: false,
  },
  {
    id: "lost-and-found",
    labelAr: "المفقودات والمعثورات",
    labelEn: "Lost & Found",
    url: "/lost-and-found",
    descriptionAr: "سجل الأغراض المفقودة والموجودة لدى الاستقبال",
    descriptionEn: "Lost and found item log at front desk",
    iconName: "PackageSearch",
    category: "services",
    quickShortcut: false,
  },
  {
    id: "services",
    labelAr: "خدمات ومرافق النادي",
    labelEn: "Gym Services & Facilities",
    url: "/services",
    descriptionAr: "حجوزات المرافق والخدمات المتاحة للأعضاء",
    descriptionEn: "Facility bookings and member services",
    iconName: "Layers",
    category: "services",
    quickShortcut: false,
  },
];

export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    id: "sub_expiring",
    nameAr: "تنبيه اقتراب انتهاء الاشتراك",
    nameEn: "Subscription Expiring Soon",
    titleAr: "تذكير: اشتراكك على وشك الانتهاء",
    bodyAr: "عزيزي المتدرب، نود تذكيرك باقتراب موعد تجديد اشتراكك في Nasaq Gym للاستمرار في تدريبك وتحقيق أهدافك دون انقطاع.",
    titleEn: "Reminder: Your subscription is expiring soon",
    bodyEn: "Dear member, your Nasaq Gym subscription is expiring soon. Renew today to keep your fitness momentum uninterrupted.",
    destinationUrl: "/profile",
    category: "membership",
  },
  {
    id: "workout_reminder",
    nameAr: "تذكير بالتمرين اليومي",
    nameEn: "Daily Workout Reminder",
    titleAr: "حان وقت التمرين",
    bodyAr: "جدولك التدريبي بانتظارك اليوم في Nasaq Gym. حافظ على استمرارك ولا تفوت حصتك التدريبية اليومية!",
    titleEn: "Time to Train",
    bodyEn: "Your workout schedule is ready for you today at Nasaq Gym. Don't skip your workout session!",
    destinationUrl: "/workouts",
    category: "fitness",
  },
  {
    id: "nutrition_update",
    nameAr: "تحديث الخطة الغذائية",
    nameEn: "Nutrition Plan Update",
    titleAr: "تم تحديث جدولك الغذائي",
    bodyAr: "قام كابتن التغذية بتحديث وجباتك وخياراتك الغذائية في التطبيق. اطلع على الخطة الجديدة الآن.",
    titleEn: "Your nutrition plan has been updated",
    bodyEn: "Your coach updated your meals and macronutrients. Check your new nutrition plan now.",
    destinationUrl: "/nutrition",
    category: "fitness",
  },
  {
    id: "inbody_followup",
    nameAr: "تذكير فحص InBody الدوري",
    nameEn: "InBody Scan Reminder",
    titleAr: "موعد فحص InBody الدوري",
    bodyAr: "حان موعد قياس InBody لمتابعة نسبة الدهون والعضلات وتطور نتائج تدريبك مع الكابتن.",
    titleEn: "Periodic InBody scan due",
    bodyEn: "Your periodic InBody measurement is due to track your muscle growth and body composition progress.",
    destinationUrl: "/followups",
    category: "fitness",
  },
  {
    id: "special_offer",
    nameAr: "عرض حصري في المتجر",
    nameEn: "Store Special Offer",
    titleAr: "عرض حصري جديد في Nasaq Gym",
    bodyAr: "تصفح أحدث الخصومات والمكملات الغذائية والمنتجات الرياضية المتوفرة الآن في متجر النادي.",
    titleEn: "Exclusive New Offer at Nasaq Gym",
    bodyEn: "Check out the latest discounts and supplements available in our gym store today.",
    destinationUrl: "/shop",
    category: "commerce",
  },
  {
    id: "new_event",
    nameAr: "فعالية أو بطولة رياضية",
    nameEn: "Gym Event / Competition",
    titleAr: "فعالية وتحدي رياضي جديد",
    bodyAr: "انضم إلى أحدث التحديات والمسابقات الحماسية في Nasaq Gym. اطلع على تفاصيل المشاركة وسجل الآن.",
    titleEn: "Exciting New Challenge & Event",
    bodyEn: "Join our latest fitness challenge at Nasaq Gym. Check the event details and sign up now.",
    destinationUrl: "/events",
    category: "community",
  },
  {
    id: "general_announcement",
    nameAr: "إعلان عام من إدارة النادي",
    nameEn: "General Gym Announcement",
    titleAr: "تنبيه مهم من إدارة Nasaq Gym",
    bodyAr: "نود إعلامكم بتحديث مهم يخص مواعيد وخدمات النادي. يرجى الاطلاع على التفاصيل داخل التطبيق.",
    titleEn: "Important Announcement from Nasaq Gym",
    bodyEn: "Please review this important update regarding gym operating hours and facility services.",
    destinationUrl: "/home",
    category: "general",
  },
];

export function validateNotificationUrl(input: string): {
  valid: boolean;
  isExternal: boolean;
  error?: string;
  cleanUrl: string;
} {
  const trimmed = (input || "").trim();
  if (!trimmed) {
    return { valid: true, isExternal: false, cleanUrl: "/home" };
  }

  // Reject dangerous protocols
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("blob:")
  ) {
    return {
      valid: false,
      isExternal: false,
      error: "الرابط يحتوي على بروتوكول غير آمن — Dangerous URL scheme detected",
      cleanUrl: "/home",
    };
  }

  // External URL
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      if (!parsed.hostname) {
        return {
          valid: false,
          isExternal: true,
          error: "عنوان URL غير مكتمل",
          cleanUrl: "/home",
        };
      }
      return { valid: true, isExternal: true, cleanUrl: trimmed };
    } catch {
      return {
        valid: false,
        isExternal: true,
        error: "تنسيق الرابط الخارجي غير صحيح",
        cleanUrl: "/home",
      };
    }
  }

  // Internal App Route
  let cleanInternal = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  // Sanitize internal route: remove invalid characters
  cleanInternal = cleanInternal.replace(/[<>"'\s]/g, "");

  return { valid: true, isExternal: false, cleanUrl: cleanInternal };
}

export function findDestinationByUrl(url: string): NotificationDestination | undefined {
  if (!url) return undefined;
  const clean = url.split("?")[0].split("#")[0].toLowerCase();
  return MEMBER_NOTIFICATION_DESTINATIONS.find((d) => d.url.toLowerCase() === clean);
}
