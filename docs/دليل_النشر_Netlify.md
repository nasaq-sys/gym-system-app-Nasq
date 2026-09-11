# دليل نشر مشروع نسق جيم على Netlify + ربط الدومين

## قبل ما تبدأ
المشروع متصل بقاعدة بياناتك على Airtable باسم **"GYM SYSTEM"** (لقيتها بحسابك). لازم:

- **AIRTABLE_BASE_ID** = `appxnNhTLltz0MjsW` (هاي القيمة ثابتة، حطيتها جاهزة بملف `.env.example`)
- **AIRTABLE_TOKEN** — لازم تسويه بنفسك (خطوات تحت)
- اختياري: **SESSION_SECRET** (أي نص عشوائي طويل، لتشفير جلسات الدخول)

### كيف تسوي AIRTABLE_TOKEN
1. روح لـ https://airtable.com/create/tokens
2. اضغط **Create new token**.
3. تحت **Scopes** ضيف:
   - `data.records:read`
   - `data.records:write`
   - `schema.bases:read`
4. تحت **Access** اختار قاعدة **GYM SYSTEM** فقط (مو كل القواعد).
5. اضغط **Create token** وانسخ القيمة (بتبدأ بـ `pat...`) — ما رح تقدر تشوفها تاني بعدين.

---

## الخطوة 1: رفع المشروع على GitHub (لو مش مرفوع أصلاً)

1. افتح https://github.com/new وسوي مستودع (repository) جديد، خاص (Private) أفضل لأنه فيه بيانات حساسة.
2. من جهازك، افتح Terminal جوا مجلد المشروع ونفذ:
   ```
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/USERNAME/REPO.git
   git push -u origin main
   ```
   (بدّل USERNAME/REPO باسم حسابك واسم المستودع)

> لو المشروع مرفوع على GitHub مسبقاً، تخطى هاي الخطوة.

---

## الخطوة 2: ربط المشروع بـ Netlify

1. روح لـ https://app.netlify.com وسجل دخول (أو أنشئ حساب مجاني).
2. اضغط **Add new site → Import an existing project**.
3. اختر **GitHub** وامنح Netlify صلاحية الوصول لحسابك، وبعدين اختر المستودع (repo) تبع نسق جيم.
4. Netlify رح يكتشف إنه مشروع Next.js تلقائياً ويعبي:
   - Build command: `npm run build`
   - Publish directory: يتحدد أوتوماتيك (مو مطلوب تعدله)
5. **قبل ما تضغط Deploy**، افتح قسم **Environment variables** وضيف:
   - `AIRTABLE_BASE_ID` = القيمة تبعك
   - `AIRTABLE_TOKEN` = القيمة تبعك
   - `SESSION_SECRET` = أي نص عشوائي طويل
6. اضغط **Deploy site**.
7. انتظر البناء (Build) يخلص (بياخد كم دقيقة). لما يخلص رح يعطيك رابط مؤقت شبه اللي بعتلي ياه (مثل `random-name-123.netlify.app`).

---

## الخطوة 3: ربط الدومين الخاص فيك

1. من داخل موقعك بـ Netlify، روح لـ **Site configuration → Domain management → Add a domain**.
2. اكتب الدومين تبعك (مثلاً `gym.domainname.com` أو `domainname.com`) واضغط **Verify** ثم **Add domain**.
3. Netlify رح يعطيك طريقتين لربط الدومين، اختر وحدة:
   - **الأسهل - استخدام Netlify DNS:** بيعطيك 4 Nameservers، روح لموقع الشركة يلي اشتريت منها الدومين (Namecheap / GoDaddy / إلخ) وبدّل الـ Nameservers بالقيم يلي عطاك ياها Netlify. بياخد وقت (من دقايق لعدة ساعات) لين ينتشر التغيير.
   - **أو ربط DNS يدوي:** بيعطيك سجل (record) نوع `A` أو `CNAME` تضيفه بلوحة تحكم الدومين عندك بدون ما تبدل الـ Nameservers بالكامل.
4. بعد ما ينتشر الـ DNS (Netlify بيأكدلك أوتوماتيك بعلامة صح خضراء)، فعّل **HTTPS** (Netlify بيسويها تلقائياً مجاناً عبر Let's Encrypt).

---

## تحديث الموقع لاحقاً

أي تعديل بتعمله على الكود وترفعه (push) لـ GitHub، Netlify رح يبني وينشر النسخة الجديدة أوتوماتيك بدون أي خطوة إضافية.

---

## تشغيل المشروع محلياً للتجربة

استخدم ملف `تشغيل_محلي.bat` الموجود بمجلد المشروع — دبل كليك عليه وبيشغللك السيرفر على `http://localhost:3000`.
(لازم تسوي نسخة من `.env.example` باسم `.env.local` وتعبي فيها القيم قبل ما تشغله محلياً.)
