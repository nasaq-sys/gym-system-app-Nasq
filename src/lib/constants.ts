export const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
export const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!;

// ─── All confirmed tables in the Airtable base ───
export const TABLES = {
  MEMBERS: "المتدربين",
  CLASSES: "الكلاسات",
  TRAINERS: "المدربين",
  SUBSCRIPTIONS: "الاشتراكات",
  CAFE_ORDERS: "طلبات الكافيه",
  CAFE_MENU: "قائمة الطعام",
  CAFE_INGREDIENTS: "مكونات الصنف",
  CAFE_ORDER_ITEMS: "بنود الطلب",
  INVENTORY: "المخزون",
  STAFF: "الموظفين",
  STORE_PRODUCTS: "منتجات المتجر",
  STORE_ORDERS: "طلبات المتجر",
  STORE_ORDER_ITEMS: "بنود طلب المتجر",
  VACATIONS: "الاجازات",
  INBODY_SCANS: "InBody Scans",
  ATTENDANCE: "سجل الحضور",
  // Paired check-in/check-out table (distinct from the raw gate-scan log
  // above) — an Airtable automation already matches each entry with its
  // exit and computes "المدة (دقيقة)" for us, so day-by-day duration reads
  // come from here instead of re-deriving it from raw scans in JS.
  ATTENDANCE_SESSIONS: "جلسات الحضور",
  LIVE_BOARD: "لوحة العداد المباشر",
  EXERCISES: "مكتبة التمارين",
  WEIGHT_LOGS: "سجل الأوزان المرفوعة",
  TRAINING_SCHEDULES: "جداول التمارين",
  SCHEDULE_ITEMS: "بنود جدول التمارين",
  NUTRITION_PLANS: "جدول التغذية",
  NUTRITION_TEMPLATES: "قوالب التغذية",
  FACILITIES: "المرافق",
  FACILITY_BOOKINGS: "جدول حجوزات المرافق",
  EVENTS: "الفعاليات والمسابقات",
  LOST_FOUND: "جدول المفقودات والمعثورات",
  FREEZES: "سجل تجميد الاشتراك",
  FAQ: "الأسئلة الشائعة",
  FOODS: "الأطعمة",
  MEAL_CALCULATOR: "حاسبة الوجبات",
  WAITING_LIST: "قائمة الانتظار",
  PRIVATE_SESSIONS: "الجلسات الخاصة",
  STAFF_TRAINER_ATTENDANCE: "سجل حضور الموظفين والمدربين",
  EQUIPMENT: "الالات",
  MAINTENANCE_LOG: "سجل الصيانة",
  CHART_OF_ACCOUNTS: "دليل الحسابات",
  TRANSACTIONS: "سجل الحركات",
  ASSETS_REGISTER: "سجل الاصول",
  SUPPLIERS: "الموردون",
  PURCHASE_INVOICES: "فواتير الشراء",
  PURCHASE_INVOICE_ITEMS: "بنود فاتورة الشراء",
  CASH_BOX: "صندوق الكاش والعهدة",
  FEEDBACK: "الفيدباك",
  FOLLOWUPS: "المتابعات الدورية",
  PLAN_TEMPLATES: "قوالب خطط التمارين",
  PLAN_TEMPLATE_ITEMS: "بنود قالب التمارين",
  NOTIFICATIONS: "الاشعارات",
  PACKAGES: "الباقات",
} as const;

// ─── Membership Packages (الباقات) ───
export const PACKAGE_FIELDS = {
  NAME: "اسم الباقة",
  PRICE: "سعر الباقة",
  DURATION_DAYS: "مدة الباقة (بالأيام)",
  DESCRIPTION: "وصف/تفاصيل الباقة",
  ACCOUNT: "الحساب المرتبط (دليل الحسابات)",
  SUBSCRIPTIONS: "الاشتراكات",
} as const;

// ─── In-app Notification Center (الاشعارات) ───
// One row per (notification, recipient) — sending to N members creates N
// rows, each independently markable as read. المتدرب/مقروء were added
// specifically to support this in-app bell system (the table originally had
// no link to a member at all).
export const NOTIFICATION_FIELDS = {
  TITLE: "عنوان الاشعار",
  BODY: "ملاحظات الاشعار",
  STATUS: "حالة الاشعار",
  DATE: "تاريخ الاشعار",
  MEMBER: "المتدرب",
  READ: "مقروء",
} as const;

// ─── Feedback (الفيدباك) — same shared table the ultra-gym-main reference
// project writes to (table ID tblEUaWDQcZ79b5VZ, reached here by its Arabic
// display name per this file's convention). رقم التذكرة and تاريخ الإرسال
// are auto fields (autoNumber / createdTime) — never written to. ───
export const FEEDBACK_FIELDS = {
  MESSAGE: "نص الرسالة",
  MEMBER: "اسم المتدرب",
  TYPE: "نوع الرسالة",
  STATUS: "حالة الطلب",
} as const;

export const FEEDBACK_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  "مشكلة تقنية": { ar: "مشكلة تقنية", en: "Technical issue" },
  اقتراح: { ar: "اقتراح", en: "Suggestion" },
  استفسار: { ar: "استفسار", en: "Inquiry" },
  شكوى: { ar: "شكوى", en: "Complaint" },
};

export const FEEDBACK_STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  جديد: { ar: "جديد", en: "New" },
  "قيد المعالجة": { ar: "قيد المعالجة", en: "In progress" },
  "تم الحل": { ar: "تم الحل", en: "Resolved" },
};

// ─── Chart of Accounts (دليل الحسابات) — real bookkeeping tree already set
// up in the base (81 accounts: أصول/خصوم/إيرادات/مصروفات/حقوق ملكية) ───
export const CHART_OF_ACCOUNTS_FIELDS = {
  NAME: "اسم و رقم الحساب",
  TYPE: "نوع الحساب",
  PARENT: "الحساب الأب",
  TOTAL_BALANCE: "الرصيد الكلي",
} as const;

export const ACCOUNT_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  الأصول: { ar: "الأصول", en: "Assets" },
  الخصوم: { ar: "الخصوم", en: "Liabilities" },
  الإيرادات: { ar: "الإيرادات", en: "Revenue" },
  المصروفات: { ar: "المصروفات", en: "Expenses" },
  "حقوق الملكية": { ar: "حقوق الملكية", en: "Equity" },
};

// ─── Transactions Ledger (سجل الحركات) — the actual bookkeeping journal;
// every real transaction (income, salary, expense, asset purchase) flows
// through this one table, categorized via حالة الصرف and optionally linked
// to a supplier/member/trainer/staff/asset record. ───
export const TRANSACTION_FIELDS = {
  DATE: "التاريخ",
  DESCRIPTION: "الشرح",
  AMOUNT: "المبلغ",
  ACCOUNT: "دليل الحسابات",
  CATEGORY: "حالة الصرف",
  SUPPLIER: "الموردون",
  SUPPLIER_NAME: "اسم المورد",
  ASSET: "سجل الاصول",
} as const;

// حالة الصرف choices — despite the field's name ("disbursement status") this
// is really the transaction's bookkeeping category.
export const TRANSACTION_CATEGORY_LABELS: Record<string, { ar: string; en: string }> = {
  دخل: { ar: "دخل", en: "Income" },
  مصاريف: { ar: "مصاريف", en: "Expense" },
  رواتب: { ar: "رواتب", en: "Salary" },
  اصول: { ar: "اصول", en: "Asset" },
};

// ─── Assets Register (سجل الاصول) — one row per fixed asset, linked back to
// the سجل الحركات purchase entry (name/date/amount below are lookups from
// that link) and optionally to a matching الالات (equipment) row. القيمة
// الحالية is a formula that already applies straight-line depreciation. ───
export const ASSET_FIELDS = {
  NAME: "اسم الاصل",
  PURCHASE_DATE: "تاريخ الشراء",
  PURCHASE_AMOUNT: "مبلغ الشراء",
  DEPRECIATION_RATE: "نسبة الاهلاك السنوية",
  CURRENT_VALUE: "القيمة الحالية ",
  LINKED_MACHINE: "الآلة المرتبطة",
} as const;

// ─── Suppliers (الموردون) ───
export const SUPPLIER_FIELDS = {
  NAME: "اسم المورد",
  PHONE: "رقم المورد",
  LIABILITIES: "قيمة الخصوم",
  PAID: "المبلغ",
  REMAINING: "المتبقي",
  DATE_ADDED: "تاريخ الاضافة",
  INVOICES: "فواتير الشراء",
} as const;

// ─── Purchase Invoices (فواتير الشراء) ───
export const PURCHASE_INVOICE_FIELDS = {
  DATE: "تاريخ الفاتورة",
  SUPPLIER: "المورد",
  PAYMENT_STATUS: "حالة الدفع",
  NOTES: "ملاحظات",
  TOTAL: "المبلغ الإجمالي للفاتورة",
} as const;

export const INVOICE_PAYMENT_STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  "مدفوعة بالكامل": { ar: "مدفوعة بالكامل", en: "Fully paid" },
  جزئي: { ar: "جزئي", en: "Partial" },
  "غير مدفوعة": { ar: "غير مدفوعة", en: "Unpaid" },
};

// ─── Cash Box & Custody (صندوق الكاش والعهدة) — day-to-day cash register
// ledger, separate from the bookkeeping journal above. ───
export const CASH_BOX_FIELDS = {
  DATETIME: "التاريخ والوقت",
  TYPE: "نوع الحركة",
  AMOUNT: "المبلغ",
  NOTES: "التفاصيل والملاحظات",
} as const;

export const CASH_BOX_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  إيداع: { ar: "إيداع", en: "Deposit" },
  سحب: { ar: "سحب", en: "Withdrawal" },
};

// ─── Equipment (الالات) ───
// STATUS/TYPE choices are stored in English in Airtable but shown with
// custom Arabic chip labels in the owner's Airtable Interface — mirrored via
// EQUIPMENT_STATUS_LABELS/EQUIPMENT_TYPE_LABELS below rather than changing
// the stored choice values.
export const EQUIPMENT_FIELDS = {
  NAME: "اسم الآلة",
  COST: "التكلفة",
  TYPE: "نوع الجهاز",
  PURCHASE_DATE: "تاريخ الشراء",
  STATUS: "الحالة",
  NOTES: "ملاحظات",
  MAINTENANCE_LOG: "سجل الصيانة",
} as const;

export const EQUIPMENT_STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  Active: { ar: "فعال", en: "Active" },
  "Needs Service": { ar: "بحاجة لصيانة", en: "Needs Service" },
  "Out of Order": { ar: "متوقف", en: "Out of Order" },
};

export const EQUIPMENT_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  Accessories: { ar: "إكسسوارات", en: "Accessories" },
  "Free Weights": { ar: "أوزان حرة", en: "Free Weights" },
  Strength: { ar: "أجهزة قوة", en: "Strength" },
  Cardio: { ar: "أجهزة كارديو", en: "Cardio" },
};

// ─── Maintenance Log (سجل الصيانة) ───
export const MAINTENANCE_LOG_FIELDS = {
  MACHINE: "جدول الالات",
  NEW_STATUS: "الحالة الجديدة",
  NOTES: "ملاحظات",
  CREATED: "Created",
} as const;

// ─── Staff/Trainer Attendance (سجل حضور الموظفين والمدربين) ───
// Shared gate log for both tables — exactly one of STAFF/TRAINER is linked
// per row, never both, which is how the admin console tells the two roles
// apart in a single combined feed.
export const STAFF_ATTENDANCE_FIELDS = {
  CARD_ID: "رقم البطاقة",
  ENTRY_TIME: "وقت الدخول",
  STAFF: "الموظفين",
  TRAINER: "المدربين",
  GATE_DECISION: "قرار البوابة",
} as const;

// ─── Members (المتدربين) — 39 fields ───
export const MEMBER_FIELDS = {
  EMAIL: "إيميل المتدرب",
  NAME: "إسم المتدرب",
  PASSWORD: "كلمة المرور",
  PHONE: "رقم هاتف المتدرب",
  GENDER: "الجنس",
  AGE: "العمر",
  DOB: "تاريخ الميلاد",
  WEIGHT: "الوزن بالكيلوغرام",
  HEIGHT: "الطول بالمتر",
  BMI: "مؤشر كتلة الجسم",
  BALANCE: "المبلغ المتبقي",
  HEALTH: "الحالة الصحية والإصابات",
  EMERGENCY: "رقم الطوارئ",
  ACTIVE: "مسموح حاليا",
  NFC: "NFC ID",
  ID: "ID",
  SERIAL: "رقم تسلسلي",
  JOIN_DATE: "تاريخ الانضمام",
  RANK: "رتبة المتدرب",
  GATE_MESSAGE: "رسالة البوابة",
  TRAINER_EMAIL: "إيميل المدرب",
  CLASSES: "جدول الكلاسات",
  TRAINER: "جدول المدربين",
  SUBSCRIPTIONS: "سجل الاشتراكات",
  CAFE_ORDERS: "طلبات الكافيه",
  STORE_ORDERS: "طلبات المتجر",
  INBODY_SCANS: "InBody Scans",
  ATTENDANCE: "سجل الحضور",
  WEIGHT_LOGS: "سجل الأوزان المرفوعة",
  MOVEMENT_LOG: "سجل الحركات",
  TRAINING_SCHEDULES: "جداول التمارين",
  TOTAL_PAID: "اجمالي المدفوع",
  LAST_LOGIN: "آخر وقت دخول",
  LATEST_LOGIN: "أحدث دخول",
  LAST_WORKOUT: "تاريخ آخر تمرين",
  WELCOME_EMAIL_STATUS: "حالة إيميل الترحيب",
  PRIVATE_SESSIONS: "الجلسات الخاصة",
  FREEZE_START_DATE: "تاريخ بداية التجميد",
  SUBSCRIPTION_STATUS: "حالة الاشتراك (from سجل الاشتراكات)",
  PLAN_TYPE: "رتبة المتدرب",
  // Checkbox — when on, the trainer owns this member's workout schedule
  // (add/edit/delete) and the member's own /workouts page becomes
  // read-only. Off by default (member manages their own plan, today's
  // existing behavior).
  PLAN_MANAGED_BY_TRAINER: "الخطة يديرها المدرب",
  TRAINER_NAME: "اسم المدرب",
  DAYS_REMAINING: "عدد الايام المتبقي",
  COMMITMENT_STATUS: "حالة الالتزام",
  TOTAL_SESSIONS: "إجمالي الجلسات أو نقاط الالتزام",
  SUB_END_DATE: "تاريخ النهاية",
  SUB_START_DATE: "تاريخ البداية",
  SUB_STATUS: "حالة الاشتراك النهائية",
  FREEZE_DAYS: "إجمالي أيام التجميد",
  FREEZE_CURRENT_YEAR: "ضمن السنة الحالية",
  // Long-text field holding a JSON array of Web Push subscription objects
  // (one per device the member has opted in on) — see src/lib/webPush.ts.
  PUSH_SUBSCRIPTIONS: "اشتراكات الاشعارات",
  EVAL_SENT: "تم إرسال طلب التقييم",
  EVAL_LINK: "رابط تقييم المدرب",
  TRAINER_FROM_SUB: "المدرب المسؤول (from سجل الاشتراكات)",
  NUTRITION_PLANS: "جدول التغذية",
  NUTRITION_TEMPLATES: "قوالب التغذية",
  EVENTS: "الفعاليات والمسابقات 2",
  FREEZES: "سجل تجميد الاشتراك",
  FACILITY_BOOKINGS: "جدول حجوزات المرافق",
  LOST_FOUND: "جدول المفقودات والمعثورات",
} as const;

// ─── Subscriptions (الاشتراكات) — 16 fields ───
export const SUBSCRIPTION_FIELDS = {
  EMAIL: "ايميل المتدرب",
  START_DATE: "تاريخ البداية",
  END_DATE: "تاريخ النهاية",
  PRICE: "سعر الاشتراك",
  PAID: "المبلغ المدفوع ",
  REMAINING: "المبلغ المتبقي",
  PLAN_TYPE: "نوع الخطة",
  STATUS: "حالة الاشتراك",
  ACTUAL_STATUS: "حالة الاشتراك الفعلية",
  DAYS_REMAINING: "عدد الايام المتبقي",
  PAYMENT_METHOD: "طريقة الدفع",
  NOTES: "الملاحظات",
  MEMBER_NAME: "إسم المتدرب (from المتدربين)",
  // Verified against the base directly — the actual link field on this
  // table is singular "المتدرب", not "المتدربين" (which doesn't exist here
  // and would silently match nothing).
  MEMBER_LINK: "المتدرب",
  ALERT_NEAR_END: "تنبيه قرب نهاية الاشتراك",
  SUB_NUMBER: "رقم الاشتراك",
} as const;

// ─── Classes (الكلاسات) — real fields ───
export const CLASS_FIELDS = {
  NAME: "اسم الكلاس",
  LEVEL: "مستوى الكلاس",
  START_TIME: "وقت البداية",
  END_TIME: "وقت النهاية",
  DURATION: "مدة الكلاس",
  DAYS: "أيام الأسبوع",
  CAPACITY: "الطاقة الاستيعابية",
  STATUS: "حالة الحجز",
  COURSE_STATUS: "حالة الكورس",
  TRAINER: "المدرب",
  MEMBERS: "المشتركين المسجلين",
  CURRENT_COUNT: "العدد الحالي",
  REMAINING: "الأماكن المتبقية",
  COURSE_START: "تاريخ بداية الكورس",
  COURSE_END: "تاريخ نهاية الكورس",
  SESSIONS_PER_WEEK: "عدد الحصص الأسبوعية",
  SESSIONS_LEFT: "عدد الحصص المتبقية",
} as const;

// ─── Trainers (المدربين) ───
// EMAIL/PASSWORD added for role-based login (trainers previously had no way
// to authenticate — only members could log in). PASSWORD stores a bcrypt
// hash only, same convention as MEMBER_FIELDS.PASSWORD.
export const TRAINER_FIELDS = {
  ID: "ID",
  NAME: "الاسم",
  COUNTER: "counter",
  MEMBERS: "المتدربين",
  SUBSCRIPTIONS: "الاشتراكات",
  EMAIL: "الايميل",
  PASSWORD: "كلمة المرور",
  SPECIALTY: "التخصص",
  PHONE: "رقم التواصل",
  ACTIVE: "مسموح حاليا",
  PRIVATE_SESSIONS: "الجلسات الخاصة",
  // Links to this same person's row in الموظفين, when a trainer is also a
  // manager/staff member — lets login offer a "switch console" button
  // instead of requiring two separate logins for one human.
  LINKED_STAFF: "ملف الموظف المرتبط (نفس الشخص)",
  RATING: "التقييم",
  SALARY: "الراتب",
  HIRE_DATE: "تاريخ التوظيف ",
  // Same field name/shape as MEMBER_FIELDS.PUSH_SUBSCRIPTIONS (see
  // src/lib/webPush.ts) — only meaningful if a matching field with this
  // exact name has also been created on the Trainers table in Airtable.
  PUSH_SUBSCRIPTIONS: "اشتراكات الاشعارات",
} as const;

// ─── Private Sessions (الجلسات الخاصة) — trainer 1:1 appointments ───
export const PRIVATE_SESSION_FIELDS = {
  NUMBER: "رقم الجلسة",
  MEMBER: "المتدرب",
  TRAINER: "المدرب",
  DATE: "تاريخ الجلسة",
  START_TIME: "وقت البداية",
  END_TIME: "وقت النهاية",
  DURATION: "مدة الجلسة",
  TYPE: "نوع الجلسة",
  PACKAGE_TYPE: "نوع الباقة",
  TOTAL_PRICE: "السعر الكلي",
  PAID_PRICE: "السعر المدفوع",
  REMAINING_PRICE: "السعر الباقي",
  PAYMENT_STATUS: "حالة الدفع",
} as const;

// ─── InBody Scans (InBody Scans) — 8 fields ───
export const INBODY_FIELDS = {
  MEMBER_NAME: "إسم المتدرب",
  MEMBER_EMAIL: "إيميل المتدرب",
  MEMBER_LINK: "الرقم التعريفي",
  GOAL: "الهدف التلقائي",
  TITLE: "عنوان الفحص",
  BODY_FAT: "نسبة الدهون",
  WEIGHT: "الوزن",
  MUSCLE_MASS: "كتلة العضلات",
} as const;

// ─── Attendance (سجل الحضور) — 8 fields ───
// NOTE: the table has NO exit-time field. "آخر وقت دخول" is a lookup of the
// member's last entry, not an exit. Exits are expressed via قرار البوابة.
export const ATTENDANCE_FIELDS = {
  MEMBER: "المتدربين",
  CARD_ID: "رقم البطاقة",
  GATE_DECISION: "قرار البوابة",
  ENTRY_TIME: "وقت الدخول",
  SUB_STATUS: "حالة الاشتراك",
  MEMBER_NAME: "اسم المتدرب (from المتدربين)",
  NFC_ID: "NFC ID (from المتدربين)",
} as const;

// ─── Attendance Sessions (جلسات الحضور) — paired entry+exit rows with a
// ready-made duration, kept by an Airtable automation. Link field here is
// singular "المتدرب" (not "المتدربين" like the raw log above — verified
// against the base directly).
export const ATTENDANCE_SESSION_FIELDS = {
  DATE: "التاريخ",
  CHECK_IN: "وقت الدخول",
  CHECK_OUT: "وقت الخروج",
  DURATION_MINUTES: "المدة (دقيقة)",
  PERSON_TYPE: "نوع الشخص",
  MEMBER: "المتدرب",
  STAFF: "الموظف",
  TRAINER: "المدرب",
} as const;

// ─── Live Board (لوحة العداد المباشر) — single-record live counter from the gate device ───
export const LIVE_BOARD_FIELDS = {
  COUNT: "العدد الحي (من الجهاز)",
  TITLE: "العنوان",
} as const;

// ─── Cafe Orders (طلبات الكافيه) — 8 fields ───
export const CAFE_ORDER_FIELDS = {
  STATUS: "الحالة",
  TIME: "وقت الطلب",
  ITEMS: "بنود الطلب",
  ORDER_NUMBER: "رقم الطلب",
  COUNTER: "العداد",
  CUSTOMER: "الزبون",
  NOTES: "ملاحظات",
  CANCEL_FINE: "نسبة الغرامة عند الإلغاء",
} as const;

// ─── Max order quantity per item (الحد الأقصى للطلب للصنف الواحد) ───
export const MAX_ORDER_ITEM_QTY = 6;

// ─── Cafe Menu (قائمة الطعام) — 7 fields ───
export const CAFE_MENU_FIELDS = {
  NAME: "اسم الصنف",
  PRICE: "السعر",
  CATEGORY: "الفئة",
  ORDER_ITEMS: "بنود الطلب",
  AVAILABLE: "متوفر",
  INGREDIENTS: "مكونات الصنف",
  IMAGE: "صورة الطبق",
  MAX_QTY: "الكمية القصوى الممكن تحضيرها",
} as const;

// ─── Cafe Ingredients (مكونات الصنف) — 4 fields ───
export const CAFE_INGREDIENT_FIELDS = {
  MENU_ITEM: "الصنف",
  QTY_PER_UNIT: "الكمية المطلوبة للوحدة",
  RAW_MATERIAL: "المادة الخام",
  DESCRIPTION: "الوصف",
} as const;

// ─── Cafe Order Items (بنود الطلب) — 6 fields ───
export const CAFE_ORDER_ITEM_FIELDS = {
  TOTAL: "الإجمالي",
  MENU_ITEM: "الصنف",
  ORDER: "الطلب",
  QTY: "الكمية",
  UNIT_PRICE: "سعر الصنف",
  DESCRIPTION: "وصف البند",
} as const;

// ─── Inventory (المخزون) — 6 fields ───
export const INVENTORY_FIELDS = {
  STATUS: "حالة المخزون",
  QUANTITY: "الكمية المتوفرة",
  UNIT: "الوحدة",
  NAME: "اسم المادة",
  INGREDIENTS: "كونات الصنف",
  MIN_ALERT: "الحد الأدنى للتنبيه",
} as const;

// ─── Store Products (منتجات المتجر) — 7 fields ───
export const STORE_PRODUCT_FIELDS = {
  NAME: "اسم المنتج",
  CATEGORY: "الفئة",
  STATUS: "حالة المخزون",
  ORDER_ITEMS: "بنود طلب المتجر",
  MIN_ALERT: "الحد الأدنى للتنبيه",
  QUANTITY: "الكمية المتوفرة",
  PRICE: "السعر",
  IMAGE: "صورة المنتج",
} as const;

// ─── Store Orders (طلبات المتجر) — 7 fields ───
export const STORE_ORDER_FIELDS = {
  ORDER_NUMBER: "رقم الطلب",
  TIME: "وقت الطلب",
  STATUS: "الحالة",
  COUNTER: "العداد",
  CUSTOMER: "الزبون",
  ITEMS: "بنود طلب المتجر",
  NOTES: "ملاحظات",
} as const;

// ─── Store Order Items (بنود طلب المتجر) — 6 fields ───
export const STORE_ORDER_ITEM_FIELDS = {
  TOTAL: "الاجمالي ",
  PRICE: "السعر",
  ORDER: "الطلب",
  QTY: "الكمية",
  PRODUCT: "المنتج",
  DESCRIPTION: "وصف البند",
} as const;

// ─── Staff Vacations (الاجازات) — real fields ───
export const VACATION_FIELDS = {
  NUMBER: "رقم الإجازة",
  REQUEST_DATE: "تاريخ تقديم الطلب",
  DAYS: "عدد الأيام",
  TYPE: "نوع الإجازة",
  START_DATE: "تاريخ البداية",
  END_DATE: "تاريخ النهاية",
  STATUS: "حالة الطلب",
  REASON: "سبب الإجازة",
  REQUESTER: "مقدم الطلب",
  STAFF: "الموظف",
  TRAINER: "المدرب",
  COST: "تكلفة الاجازة",
} as const;

// ─── Exercise Library (مكتبة التمارين) — 3 fields ───
export const EXERCISE_FIELDS = {
  NAME: "اسم التمرين",
  MUSCLE_GROUP: "العضلة المستهدفة",
  WEIGHT_LOGS: "سجل الأوزان المرفوعة",
} as const;

// ─── Weight Log (سجل الأوزان المرفوعة) — 7 fields ───
export const WEIGHT_LOG_FIELDS = {
  MEMBER: "اسم المتدرب",
  EXERCISE: "اسم التمرين",
  WEIGHT: "الوزن بالكيلوغرام",
  REPS: "التكرارات",
  SETS: "عدد الجولات",
  DATE: "التاريخ",
  SESSION_NOTES: "تفاصيل الجلسة",
} as const;

// ─── Training Schedules (جداول التمارين) ───
// Originally only had اسم الخطة / ملف الخطة / المتدربين 2 — a per-plan file
// attachment table with no structured day/exercise data, even though the
// workouts page UI already assumed a day-by-day exercise list existed. Added
// اليوم المستهدف (singleSelect, matches DAY_KEYS[].ar exactly) so schedule
// entries persist a day, and reused the existing المتدربين 2 link (already
// pointed at المتدربين) to scope each entry to a member.
// EXERCISES/REPS_SETS below are legacy: an earlier version encoded exercises
// as free text like "اسم التمرين (4×8)" and matched them to مكتبة التمارين
// by string comparison — fragile (typos/formatting broke the match, and it
// silently broke again whenever the text-encoding format changed). Real
// per-exercise data now lives in the بنود جدول التمارين junction table
// (SCHEDULE_ITEM_FIELDS below), which links to actual مكتبة التمارين
// records instead of matching on name. These two fields are kept only so
// old records aren't orphaned; new code should not write to them.
export const SCHEDULE_FIELDS = {
  PLAN_NAME: "اسم الخطة",
  EXERCISES: "التمارين",
  TARGET_DAY: "اليوم المستهدف",
  REPS_SETS: "التكرارات والمجموعات",
  MEMBER: "المتدربين 2",
} as const;

// ─── Schedule Exercise Items (بنود جدول التمارين) ───
// Junction table: one row per exercise within a single day's plan. Links
// directly to مكتبة التمارين (real record, not a name) so the weight log
// can always resolve which exercise a schedule entry refers to.
export const SCHEDULE_ITEM_FIELDS = {
  DESCRIPTION: "الوصف",
  PLAN: "الخطة",
  EXERCISE: "التمرين",
  // Legacy combined free-text field (e.g. "10×3"). Kept read-only for old
  // records; new writes go to REPS/SETS below instead.
  REPS_SETS: "التكرارات والمجموعات",
  REPS: "التكرارات",
  SETS: "المجموعات",
} as const;

// ─── Workout Plan Templates (قوالب خطط التمارين) ───
// A reusable 7-day program a trainer builds once (e.g. "خطة الأسبوع 1-2")
// and applies to any trainee in one click, instead of manually picking
// exercises for every trainee from scratch. Not linked to any member — the
// day-by-day exercise data lives in بنود قالب التمارين below, matched back
// here via PLAN_TEMPLATE_ITEM_FIELDS.TEMPLATE.
export const PLAN_TEMPLATE_FIELDS = {
  NAME: "اسم القالب",
  DESCRIPTION: "وصف القالب",
} as const;

// ─── Template Exercise Items (بنود قالب التمارين) ───
// One row per exercise within a single day of a template — flat structure
// (no separate "day" record layer) since a template never needs a per-day
// plan name of its own, just template+day+exercise+repsSets. DAY's stored
// choices are the same Arabic strings as DAY_KEYS[].ar in the app (اليوم
// الاول..اليوم السابع) so applying a template can group items by day the
// exact same way schedule items are grouped by TARGET_DAY.
export const PLAN_TEMPLATE_ITEM_FIELDS = {
  DESCRIPTION: "الوصف",
  TEMPLATE: "القالب",
  DAY: "اليوم",
  EXERCISE: "التمرين",
  REPS_SETS: "التكرارات والمجموعات",
} as const;

// ─── Staff (الموظفين) ───
// EMAIL/PASSWORD added for role-based login, same convention as
// MEMBER_FIELDS.PASSWORD/TRAINER_FIELDS.PASSWORD (bcrypt hash only). RANK's
// stored choices are مدرب / كاشير / إداري / محاسب / عامل نظافة / مدير — any
// row in this table is treated as admin-console access for now, since the
// app doesn't yet have separate cashier/accountant consoles.
export const STAFF_FIELDS = {
  NAME: "اسم الموظف",
  EMAIL: "الايميل",
  PASSWORD: "كلمة المرور",
  PHONE: "رقم هاتف الموظف",
  RANK: "رتبة الوظيفة",
  ACTIVE: "مسموح حاليا",
  HIRE_DATE: "تاريخ التوظيف ",
  // Reverse side of TRAINER_FIELDS.LINKED_STAFF — Airtable auto-named it
  // after the source table when the link field was created.
  LINKED_TRAINER: "المدربين",
  RATING: "التقييم",
  SALARY: "الراتب",
} as const;

// RANK's stored choice values (رتبة الوظيفة on الموظفين).
export const STAFF_RANK_LABELS: Record<string, { ar: string; en: string }> = {
  مدرب: { ar: "مدرب", en: "Trainer" },
  كاشير: { ar: "كاشير", en: "Cashier" },
  إداري: { ar: "إداري", en: "Admin staff" },
  محاسب: { ar: "محاسب", en: "Accountant" },
  "عامل نظافة": { ar: "عامل نظافة", en: "Cleaner" },
  مدير: { ar: "مدير", en: "Manager" },
};

// ─── Nutrition Plans (جدول التغذية) ───
export const NUTRITION_PLAN_FIELDS = {
  NUMBER: "رقم الخطة",
  CALORIES: "السعرات الحرارية اليومية",
  PROTEIN: "البروتين (غرام)",
  CARBS: "الكربوهيدرات (غرام)",
  FAT: "الدهون (غرام)",
  GOAL: "الهدف",
  STATUS: "حالة الخطة",
  MEAL_1: "وجبة 1 (إفطار)",
  SNACK_1: "سناك 1 (صباحي)",
  MEAL_2: "وجبة 2 (غداء)",
  SNACK_2: "سناك 2 (قبل/بعد التمرين)",
  MEAL_3: "وجبة 3 (عشاء)",
  SNACK_3: "سناك 3 (قبل النوم)",
  BREAKFAST: "وجبة الإفطار",
  LUNCH: "وجبة الغداء",
  DINNER: "وجبة العشاء",
  MEALS_DETAILS: "تفاصيل الوجبات",
  MEMBERS: "المتدربين",
} as const;

// ─── Nutrition Templates (قوالب التغذية) ───
export const NUTRITION_TEMPLATE_FIELDS = {
  NAME: "اسم القالب",
  GOAL: "الهدف",
  CALORIES: "السعرات الحرارية",
  PROTEIN: "البروتين",
  CARBS: "الكربوهيدرات",
  FAT: "الدهون",
  MEAL_1: "وجبة 1 (إفطار)",
  SNACK_1: "سناك 1 (صباحي)",
  MEAL_2: "وجبة 2 (غداء)",
  SNACK_2: "سناك 2 (قبل/بعد التمرين)",
  MEAL_3: "وجبة 3 (عشاء)",
  SNACK_3: "سناك 3 (قبل النوم)",
  BREAKFAST: "وجبة الإفطار",
  LUNCH: "وجبة الغداء",
  DINNER: "وجبة العشاء",
  MEALS_DETAILS: "تفاصيل الوجبات",
  MEMBERS: "المتدربين",
} as const;

// ─── Facilities (المرافق) ───
export const FACILITY_FIELDS = {
  NUMBER: "رقم المرفق",
  NAME: "اسم المرفق",
  TYPE: "المرفق",
  CAPACITY: "السعة القصوى",
  BOOKINGS: "جدول حجوزات المرافق",
  ACTIVE: "فعال",
} as const;

export const FACILITY_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  ساونا: { ar: "ساونا", en: "Sauna" },
  "ستيم روم": { ar: "ستيم روم", en: "Steam Room" },
  مسبح: { ar: "مسبح", en: "Pool" },
};

// ─── Periodic Follow-ups (المتابعات الدورية) ───
// A trainer-conducted check-in: body measurements + weight/body-fat snapshot
// taken periodically, distinct from the InBody Scans table (device-scan log
// used by the home page's body-fat gauge). All measurement fields are stored
// as singleLineText in Airtable (e.g. "75.0"), not numbers — parse on read.
export const FOLLOWUP_FIELDS = {
  NUMBER: "رقم المتابعة",
  MEMBER: "المتدرب",
  NUTRITION_PLAN: "الخطة الغذائية",
  DATE: "تاريخ المتابعة",
  WEIGHT: "الوزن (كغ)",
  BODY_FAT: "نسبة الدهون (%)",
  WAIST: "محيط الخصر (سم)",
  CHEST: "محيط الصدر (سم)",
  ARM: "محيط الذراع (سم)",
  THIGH: "محيط الفخذ (سم)",
  TRAINER_NOTES: "ملاحظات المدرب",
  MEMBER_NOTES: "ملاحظات المتدرب",
} as const;

// ─── Facility Bookings (جدول حجوزات المرافق) ───
// One row = one bookable slot (facility + date + period), not one row per
// member. المتدرب is a multipleRecordLinks field — several members can link
// to the same slot up to السعة القصوى (a lookup from المرافق), and العدد
// الحالي / العدد المتاح are Airtable-computed (Count / formula) from that
// link, never written directly. The admin creates a slot (facility + date +
// period, status مؤكد, no members yet); members then link/unlink themselves
// to book or cancel their own spot in it.
export const FACILITY_BOOKING_FIELDS = {
  NUMBER: "رقم الحجز",
  DATE: "التاريخ",
  FACILITY: "المرفق",
  CAPACITY: "السعة القصوى",
  MEMBER: "المتدرب",
  CURRENT_COUNT: "العدد الحالي",
  AVAILABLE: "العدد المتاح",
  STATUS: "حالة الحجز",
  PERIOD: "حقل الفترة",
} as const;

// Fixed time-slot choices on حقل الفترة (Airtable singleSelect — admin picks
// one of these when opening a slot, not free text).
export const FACILITY_BOOKING_PERIODS = [
  "5:00pm - 6:00pm",
  "6:00pm - 7:00pm",
  "8:00pm - 9:00pm",
] as const;

export const FACILITY_BOOKING_STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  مؤكد: { ar: "مؤكد", en: "Confirmed" },
  ملغي: { ar: "ملغي", en: "Cancelled" },
};

// ─── Events & Competitions (الفعاليات والمسابقات) ───
export const EVENT_FIELDS = {
  NUMBER: "رقم الفعالية",
  NAME: "اسم الفعالية",
  TYPE: "نوع الفعالية",
  DATE: "تاريخ الفعالية",
  START_TIME: "وقت البداية",
  END_TIME: "وقت النهاية",
  LOCATION: "المكان",
  STATUS: "حالة الفعالية",
  FEE: "رسوم الاشتراك",
  MAX_PARTICIPANTS: "الحد الأقصى للمشاركين",
  PARTICIPANT_COUNT: "عدد المشاركين",
  PRIZE: "الجائزة",
  NOTES: "الملاحظات",
  WINNER: "الفائز",
  REGISTRANTS: "المشتركين",
  WAITING_LIST: "قائمة الانتظار",
} as const;

// ─── Waiting List (قائمة الانتظار) — shared queue table for events & facilities & classes ───
export const WAITING_LIST_FIELDS = {
  TYPE: "نوع الطلب",
  EVENT: "الفعالية",
  FACILITY: "المرفق",
  CLASS: "الكلاسات",
  MEMBER: "المتدرب",
  STATUS: "الحالة",
  REQUEST_DATE: "تاريخ الطلب",
  NOTES: "ملاحظات",
  NAME: "اسم الطلب",
} as const;

// ─── Lost & Found (جدول المفقودات والمعثورات) ───
export const LOST_FOUND_FIELDS = {
  NUMBER: "رقم البلاغ",
  TYPE: "نوع البلاغ",
  ITEM_NAME: "اسم الغرض",
  DESCRIPTION: "وصف الغرض",
  LOCATION: "مكان الفقد/العثور",
  DATE: "تاريخ الفقد/العثور",
  STATUS: "حالة الغرض",
  REPORTER: "مقدم البلاغ",
  RECEIVER: "مستلم الغرض",
  RECEIVED_DATE: "تاريخ الاستلام",
} as const;

// Stored choice values are already Arabic (unlike Equipment) — these maps
// only exist to provide the English label for the EN locale.
export const LOST_FOUND_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  مفقودات: { ar: "مفقودات", en: "Lost" },
  معثورات: { ar: "معثورات", en: "Found" },
};

export const LOST_FOUND_STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  "قيد البحث": { ar: "قيد البحث", en: "Searching" },
  موجود: { ar: "موجود", en: "Available" },
  "تم التسليم": { ar: "تم التسليم", en: "Delivered" },
};

// ─── Subscription Freezes (سجل تجميد الاشتراك) ───
export const FREEZE_FIELDS = {
  STATUS: "حالة التجميد",
  REASON: "السبب",
  DAYS: "عدد أيام التجميد",
  START_DATE: "تاريخ بداية التجميد",
  END_DATE: "تاريخ نهاية التجميد",
  NOTES: "ملاحظات",
  MEMBER: "المتدرب",
  SUBSCRIPTION: "الاشتراك",
} as const;

// ─── FAQ (الأسئلة الشائعة) ───
export const FAQ_FIELDS = {
  QUESTION_AR: "السؤال (عربي)",
  ANSWER_AR: "الجواب (عربي)",
  QUESTION_EN: "Question (English)",
  ANSWER_EN: "Answer (English)",
  CATEGORY: "الفئة",
  ORDER: "ترتيب الظهور",
  ACTIVE: "نشط؟",
} as const;

// ─── Foods (الأطعمة) — per-100g values ───
export const FOOD_FIELDS = {
  NAME: "اسم الصنف",
  CALORIES_100G: "السعرات لكل 100 غرام",
  PROTEIN_100G: "البروتين لكل 100 غرام",
  FAT_100G: "الدهون لكل 100 غرام",
  CARBS_100G: "الكربوهيدرات لكل 100 غرام",
  MEAL_CALCULATOR: "حاسبة الوجبات",
} as const;

// ─── Meal Calculator (حاسبة الوجبات) — pre-computed meal rows ───
export const MEAL_CALCULATOR_FIELDS = {
  DESCRIPTION: "الوصف",
  QUANTITY_GRAMS: "الكمية بالغرام",
  ACTUAL_CALORIES: "السعرات الفعلية",
  ACTUAL_PROTEIN: "البروتين الفعلي",
  ACTUAL_FAT: "الدهون الفعلية",
  ACTUAL_CARBS: "الكربوهيدرات الفعلية",
  FOOD_LINK: "اختر الصنف",
  CALORIES_100G: "السعرات لكل 100 غرام",
  PROTEIN_100G: "البروتين لكل 100 غرام",
  FAT_100G: "الدهون لكل 100 غرام",
  CARBS_100G: "الكربوهيدرات لكل 100 غرام",
  // Added so each row can be tied to a member and a day — the table only
  // had food/quantity/computed-macro fields before, with no way to know
  // who logged an entry or when.
  MEMBER: "المتدرب",
  DATE: "التاريخ",
} as const;

export const LOCALES = {
  AR: "ar",
  EN: "en",
} as const;

export type Locale = (typeof LOCALES)[keyof typeof LOCALES];
