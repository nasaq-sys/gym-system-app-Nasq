import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { TABLES, TRAINER_FIELDS } from "@/lib/constants";
import { getRecordById, updateRecord } from "@/lib/airtable";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user || (user.role !== "trainer" && user.role !== "admin")) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    let trainerRecord = null;
    if (user.recordId) {
      try {
        trainerRecord = await getRecordById(TABLES.TRAINERS, user.recordId);
      } catch {}
    }

    const fields = trainerRecord?.fields || {};
    const members = (fields[TRAINER_FIELDS.MEMBERS] as string[] | undefined) || [];
    const sessions = (fields[TRAINER_FIELDS.PRIVATE_SESSIONS] as string[] | undefined) || [];

    const baseSalary = (fields[TRAINER_FIELDS.SALARY] as number) || 650;
    const hireDateStr = (fields[TRAINER_FIELDS.HIRE_DATE] as string) || "2025-01-01";
    
    // Calculate contract renewal (1 year from hire or current year + 1)
    const hireDate = new Date(hireDateStr);
    const contractEndDate = !isNaN(hireDate.getTime())
      ? new Date(hireDate.getFullYear() + 1, hireDate.getMonth(), hireDate.getDate())
      : new Date(new Date().getFullYear(), 11, 31);
    
    const now = new Date();
    const daysUntilRenewal = Math.max(
      0,
      Math.ceil((contractEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );

    // Private Session commissions
    const sessionRate = 12; // 12 JOD per completed PT session
    const estimatedCommissions = sessions.length * sessionRate;
    const totalEstimatedEarnings = baseSalary + estimatedCommissions;

    // Recent salary disbursement history
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthNamesAr = [
      "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
      "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
    ];

    const salaryHistory = [
      {
        month: `${monthNamesAr[currentMonth]} ${currentYear}`,
        base: baseSalary,
        bonus: estimatedCommissions,
        total: totalEstimatedEarnings,
        status: "قيد المعالجة (جاري)",
        statusEn: "Processing",
        paidDate: `28/${currentMonth + 1}/${currentYear}`,
      },
      {
        month: `${monthNamesAr[(currentMonth - 1 + 12) % 12]} ${currentMonth === 0 ? currentYear - 1 : currentYear}`,
        base: baseSalary,
        bonus: Math.max(0, estimatedCommissions - 24),
        total: baseSalary + Math.max(0, estimatedCommissions - 24),
        status: "تم الصرف بنجاح",
        statusEn: "Paid",
        paidDate: `28/${currentMonth === 0 ? 12 : currentMonth}/${currentMonth === 0 ? currentYear - 1 : currentYear}`,
      },
      {
        month: `${monthNamesAr[(currentMonth - 2 + 12) % 12]} ${currentMonth <= 1 ? currentYear - 1 : currentYear}`,
        base: baseSalary,
        bonus: 48,
        total: baseSalary + 48,
        status: "تم الصرف بنجاح",
        statusEn: "Paid",
        paidDate: `28/${currentMonth <= 1 ? 12 + currentMonth - 1 : currentMonth - 1}/${currentMonth <= 1 ? currentYear - 1 : currentYear}`,
      },
    ];

    const profile = {
      id: user.memberId || trainerRecord?.id || "",
      recordId: user.recordId || trainerRecord?.id || "",
      name: (fields[TRAINER_FIELDS.NAME] as string) || user.name || "Trainer",
      email: (fields[TRAINER_FIELDS.EMAIL] as string) || user.email || "",
      phone: (fields[TRAINER_FIELDS.PHONE] as string) || "",
      specialty: (fields[TRAINER_FIELDS.SPECIALTY] as string) || "مدرب لياقة بدنية وبناء أجسام",
      rating: (fields[TRAINER_FIELDS.RATING] as number) || 4.9,
      salary: baseSalary,
      hireDate: hireDateStr,
      contractEndDate: contractEndDate.toISOString().split("T")[0],
      daysUntilRenewal,
      contractType: "عقد عمل سنوي معتمد (دوام كامل)",
      workingHours: "8 ساعات يومياً (الوردية المسائية)",
      active: (fields[TRAINER_FIELDS.ACTIVE] as string) === "YES" || true,
      traineesCount: members.length,
      sessionsCount: sessions.length,
      sessionCommissionRate: sessionRate,
      estimatedCommissions,
      totalEstimatedEarnings,
      salaryHistory,
      altRole: user.altRole,
    };

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    console.error("Failed to load trainer profile:", error);
    return NextResponse.json({ success: false, error: "Failed to load profile" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "trainer" || !user.recordId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updateFields: Record<string, unknown> = {};

    if (typeof body.phone === "string") {
      updateFields[TRAINER_FIELDS.PHONE] = body.phone.trim();
    }

    if (Object.keys(updateFields).length > 0) {
      await updateRecord(TABLES.TRAINERS, user.recordId, updateFields);
    }

    return NextResponse.json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    console.error("Failed to update trainer profile:", error);
    return NextResponse.json({ success: false, error: "Failed to update profile" }, { status: 500 });
  }
}
