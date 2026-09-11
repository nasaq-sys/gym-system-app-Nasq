# خارطة الكود — GYM_SYSTEM

ملاحظات عملية لأي شغل قادم على التطبيق: من وين نجيب الألوان، وين نحط منطق جديد، وكيف نكمل تطبيق تصميم goJim على باقي الصفحات، وكيف نبني واجهة المدير/المدرب لاحقاً.

## 1. نظام الألوان (Design Tokens)

كل الألوان معرّفة مرة وحدة بـ `src/app/globals.css` كـ CSS variables (`:root` = داكن، `.light` = فاتح)، وTailwind بياخدها عن طريق `@theme inline`. **ما تكتب هيكس كولور جوا مكوّن أبداً** — استخدم أسماء Tailwind الجاهزة:

```
bg-background   text-foreground   bg-card   bg-card-hover   bg-card-soft
border-border   text-muted        text-muted-foreground
bg-accent       text-accent       bg-success / bg-warning / bg-info / bg-destructive
```

القيم الحالية منسوخة حرفياً من ملف التصميم `goJim.dc.html` (Claude Design project
`a5760e8a-b635-4957-8ca9-e860f9bc3cda`). إذا تغيّر التصميم هناك، افتحه وقارن قيم
`.theme-dark{...}` و`.theme-light{...}` مع البلوك الموازي بأول `globals.css`
(في كومنت فوقه بيشرح الـ mapping).

ألوان مؤشر الدهون (`BODY_FAT_ZONES` بـ `BodyFatGauge.tsx`) مو مرتبطة بالـ theme
tokens عن قصد — هاي ألوان دلالية ثابتة (أزرق/أخضر/أصفر/أحمر) بترجع بنفس القيمة
بالوضعين الداكن والفاتح، متل ما هي بالتصميم الأصلي.

## 2. تنظيم المجلدات

```
src/app/(dashboard)/<page>/page.tsx   صفحات المتدرب (client components)
src/app/api/<resource>/route.ts       API routes — كل واحد بيتعامل مع جدول Airtable وحدة أو اتنين مرتبطين
src/components/layout/                Sidebar, Topbar, MobileNav, DashboardShell, SideDrawer, QuickAddSheet
src/components/shared/                مكونات عامة (Card, StatCard, BodyFatGauge, DaysRing...)
src/lib/                              منطق مشترك بدون UI (airtable.ts, auth.ts, format.ts, constants.ts...)
src/hooks/                            React hooks (useI18n)
src/i18n/                             نصوص ar.json / en.json
```

**قاعدة عملية:** أي دالة تنسيق/تحويل بيانات (تواريخ، عملة، أرقام Airtable) لازم
تروح بـ `src/lib/format.ts` مو تتكرر جوا الصفحة. صفحة `home` صارت تستخدمها؛ باقي
الصفحات (`nutrition`, `profile`, ...) لسا فيها نسخ محلية قديمة من نفس الدوال —
لما نشتغل عليهم لاحقاً، نلغي النسخة المحلية ونستورد من `@/lib/format`.

## 3. تطبيق التصميم على باقي الصفحات

الصفحة الرئيسية (`home`) هي المرجع الآن. النمط المتبع فيها لأي صفحة جاية:

1. الألوان جاهزة تلقائياً (نفس `globals.css`) — ما في شغل إضافي.
2. الكروت/الأزرار: استخدم `Card` / `CardHeader` / `StatCard` الموجودين بدل ما
   تبني div جديد من الصفر، حتى نضمن نفس الـ radius والـ spacing بكل مكان.
3. أي عداد/مقياس دائري جديد (زي مؤشر الدهون) خذه كمرجع هندسي من
   `BodyFatGauge.tsx` (الدوال `polar` و`zoneAngleFrom`) بدل ما تعيد حساب هندسة
   الدائرة من الصفر.
4. قبل ما تبدأ صفحة، افتح ملف التصميم وقارن أي فرق ألوان/مسافات محدد لهاي
   الصفحة تحديداً — الأسلوب العام موحّد لكن كل صفحة إلها تفاصيل خاصة (شكل
   القوائم، الشارات، إلخ).

## 4. واجهة المدير / المدرب (خطوة قادمة)

لما نبدأ فيها، الاقتراح:

- Route group جديد منفصل: `src/app/(admin)/...` بنفس نمط `(dashboard)` الحالي
  (`layout.tsx` خاص فيه شيل/نافيغيشن مختلف عن شيل المتدرب).
- صلاحيات: `src/lib/auth.ts` حالياً بيتعامل مع جلسة المتدرب فقط (email/memberId).
  لازم نضيف مفهوم "دور" (member / trainer / admin) — إما حقل بجدول `الموظفين`
  أو `المدربين`، أو جدول صلاحيات منفصل، وبعدين middleware/route guard جديد
  بجانب اللي موجود حالياً بـ `src/middleware.ts`.
- الجداول جاهزة أصلاً بـ Airtable (`STAFF`, `TRAINERS`, `VACATIONS`,
  `INVENTORY`...) — شوف `src/lib/constants.ts`، فيه كل أسماء الجداول والحقول
  جاهزة، ما في داعي تعيد استكشافها.
- نفس منطق `src/lib/airtable.ts` (getRecords/createRecord/updateRecord...)
  بيصير يشتغل عليها مباشرة، بس API routes جديدة تحت `src/app/api/admin/...`.

هاي بس تخطيط أولي — لما نبدأ فعلياً فيها منراجع التفاصيل مع بعض قبل ما نبني.
