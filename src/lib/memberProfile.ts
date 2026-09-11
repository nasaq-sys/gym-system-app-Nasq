import type { AirtableRecord } from "@/lib/airtable";

type FieldType = "text" | "number" | "date" | "datetime" | "bool" | "url";

interface GroupDef {
  key: string;
  ar: string;
  en: string;
}

interface FieldDef {
  field: string;
  type: FieldType;
  group: string;
  ar: string;
  en: string;
}

export const PROFILE_GROUPS: GroupDef[] = [
  { key: "personal", ar: "المعلومات الشخصية", en: "Personal Info" },
  { key: "contact", ar: "معلومات التواصل", en: "Contact Info" },
  { key: "health", ar: "الصحة والجسم", en: "Health & Body" },
  { key: "membership", ar: "الاشتراك والعضوية", en: "Membership & Access" },
  { key: "trainer", ar: "المدرب المسؤول", en: "Assigned Trainer" },
];

export const PROFILE_FIELDS: FieldDef[] = [
  // Personal
  { field: "إسم المتدرب", type: "text", group: "personal", ar: "إسم المتدرب", en: "Full Name" },
  { field: "ID", type: "text", group: "personal", ar: "رقم العضوية (ID)", en: "Member ID" },
  { field: "رقم تسلسلي", type: "number", group: "personal", ar: "رقم تسلسلي", en: "Serial No." },
  { field: "الجنس", type: "text", group: "personal", ar: "الجنس", en: "Gender" },
  { field: "العمر", type: "number", group: "personal", ar: "العمر", en: "Age" },
  { field: "تاريخ الميلاد", type: "date", group: "personal", ar: "تاريخ الميلاد", en: "Date of Birth" },
  { field: "تاريخ الانضمام", type: "date", group: "personal", ar: "تاريخ الانضمام", en: "Join Date" },
  { field: "رتبة المتدرب", type: "text", group: "personal", ar: "رتبة المتدرب", en: "Member Rank" },
  { field: "NFC ID", type: "text", group: "personal", ar: "معرف NFC", en: "NFC Tag" },

  // Contact
  { field: "إيميل المتدرب", type: "text", group: "contact", ar: "البريد الإلكتروني", en: "Email" },
  { field: "رقم هاتف المتدرب", type: "text", group: "contact", ar: "رقم الهاتف", en: "Phone Number" },
  { field: "رقم الطوارئ", type: "text", group: "contact", ar: "رقم الطوارئ", en: "Emergency Contact" },
  { field: "إيميل المدرب", type: "text", group: "contact", ar: "إيميل المدرب", en: "Trainer Email" },

  // Health & Body
  { field: "الوزن بالكيلوغرام", type: "number", group: "health", ar: "الوزن (كغ)", en: "Weight (kg)" },
  { field: "الطول بالمتر", type: "number", group: "health", ar: "الطول (م)", en: "Height (m)" },
  { field: "مؤشر كتلة الجسم", type: "number", group: "health", ar: "مؤشر كتلة الجسم (BMI)", en: "BMI" },
  { field: "الحالة الصحية والإصابات", type: "text", group: "health", ar: "الحالة الصحية والإصابات", en: "Health & Injuries" },

  // Membership
  { field: "رتبة المتدرب", type: "text", group: "membership", ar: "نوع الخطة / الباقة", en: "Plan Type" },
  { field: "حالة الاشتراك النهائية", type: "text", group: "membership", ar: "حالة الاشتراك", en: "Subscription Status" },
  { field: "مسموح حاليا", type: "bool", group: "membership", ar: "صلاحية الدخول حالياً", en: "Access Allowed" },
  { field: "عدد الايام المتبقي", type: "number", group: "membership", ar: "الأيام المتبقية", en: "Days Remaining" },
  { field: "تاريخ البداية", type: "date", group: "membership", ar: "تاريخ بداية الاشتراك", en: "Start Date" },
  { field: "تاريخ النهاية", type: "date", group: "membership", ar: "تاريخ نهاية الاشتراك", en: "End Date" },
  { field: "اجمالي المدفوع", type: "number", group: "membership", ar: "إجمالي المدفوع", en: "Total Paid" },
  { field: "المبلغ المتبقي", type: "number", group: "membership", ar: "المبلغ المتبقي", en: "Remaining Balance" },
  { field: "حالة الالتزام", type: "text", group: "membership", ar: "حالة الالتزام", en: "Commitment Status" },
  { field: "إجمالي الجلسات أو نقاط الالتزام", type: "number", group: "membership", ar: "الجلسات / نقاط الالتزام", en: "Sessions / Points" },
  { field: "إجمالي أيام التجميد", type: "number", group: "membership", ar: "إجمالي أيام التجميد", en: "Freeze Days" },
  { field: "ضمن السنة الحالية", type: "number", group: "membership", ar: "تجميد السنة الحالية", en: "This Year Freezes" },
  { field: "تاريخ بداية التجميد", type: "date", group: "membership", ar: "بداية التجميد", en: "Freeze Start" },
  { field: "رسالة البوابة", type: "text", group: "membership", ar: "رسالة البوابة", en: "Gate Message" },

  // Trainer
  { field: "اسم المدرب", type: "text", group: "trainer", ar: "اسم المدرب المسؤول", en: "Trainer Name" },
  { field: "رابط تقييم المدرب", type: "url", group: "trainer", ar: "رابط تقييم المدرب", en: "Trainer Evaluation Link" },
];

const GENDER_AR: Record<string, string> = { ذكر: "ذكر", انثى: "أنثى", male: "ذكر", female: "أنثى" };
const GENDER_EN: Record<string, string> = { ذكر: "Male", انثى: "Female", male: "Male", female: "Female" };
const YES_NO_AR: Record<string, string> = { YES: "نعم", NO: "لا", true: "نعم", false: "لا" };
const YES_NO_EN: Record<string, string> = { YES: "Yes", NO: "No", true: "Yes", false: "No" };

export interface ProfileItem {
  key: string;
  type: FieldType;
  group: string;
  labelAr: string;
  labelEn: string;
  value: unknown;
  valueAr: string;
  valueEn: string;
}

export function buildProfile(record: AirtableRecord, locale: "ar" | "en"): ProfileItem[] {
  const f = record.fields;
  const items: ProfileItem[] = [];

  for (const def of PROFILE_FIELDS) {
    const raw = f[def.field];
    const isEmpty = raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0);

    let value: unknown = raw;
    let valueAr = "";
    let valueEn = "";

    if (!isEmpty) {
      if (def.type === "bool") {
        const s = String(raw);
        value = s;
        valueAr = YES_NO_AR[s] ?? s;
        valueEn = YES_NO_EN[s] ?? s;
      } else {
        const s = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
        value = s;
        if (def.field === "الجنس") {
          valueAr = GENDER_AR[String(s)] ?? String(s);
          valueEn = GENDER_EN[String(s)] ?? String(s);
        } else if (def.type === "datetime" && typeof s === "string") {
          const d = new Date(s);
          if (!isNaN(d.getTime())) {
            const fmt = (lo: string) =>
              new Intl.DateTimeFormat(lo, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(d);
            valueAr = fmt("ar");
            valueEn = fmt("en-US");
          } else {
            valueAr = s;
            valueEn = s;
          }
        } else {
          valueAr = String(s);
          valueEn = String(s);
          if (def.field === "اجمالي المدفوع" || def.field === "المبلغ المتبقي") {
            valueAr = `${String(s)} د.أ`;
            valueEn = `${String(s)} JOD`;
          }
        }
      }
    }

    items.push({
      key: def.field,
      type: def.type,
      group: def.group,
      labelAr: def.ar,
      labelEn: def.en,
      value,
      valueAr,
      valueEn,
    });
  }

  if (locale === "en") {
    void locale;
  }

  return items;
}
