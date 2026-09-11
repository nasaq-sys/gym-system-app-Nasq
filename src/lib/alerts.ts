import { sendSmtpEmail } from "./smtpClient";

/**
 * Redis Error Alerting & Notification Service using Nodemailer/SMTP
 * 
 * Features:
 * 1. Primary Delivery: Gmail SMTP (nasaqhq@gmail.com) via port 587/465.
 * 2. Multi-recipient: momenaborob@gmail.com, info@nasaqjo.com.
 * 3. Automatic 1-hour cooldown to prevent inbox flooding.
 * 4. Force-test mode: Allows testing via ?test_redis_error=true bypassing cooldown.
 * 5. Automatic recovery detection: Resets error status when Redis resumes normal operation.
 */

const RECEIVER_EMAILS = (process.env.RECEIVER_EMAIL || "momenaborob@gmail.com,info@nasaqjo.com")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

const ONE_HOUR_MS = 60 * 60 * 1000;

let lastAlertSentAt = 0;
let isRedisInErrorState = false;

export interface RedisAlertPayload {
  error: string;
  context?: string;
  timestamp: string;
  recipients: string[];
  isTest?: boolean;
}

/**
 * Triggers a rate-limited email alert if Redis encounters an error or limit breach.
 * 
 * @param err The error thrown by Redis
 * @param context Description of the failing operation
 * @param forceSend If true (e.g. ?test_redis_error=true), bypasses the 1-hour cooldown
 */
export async function triggerRedisErrorAlert(
  err: unknown,
  context: string = "Redis Operation",
  forceSend: boolean = false
): Promise<boolean> {
  const now = Date.now();
  const errorMessage = err instanceof Error ? err.message : String(err);

  isRedisInErrorState = true;

  console.error(`[Redis Error Alert] [${context}]:`, errorMessage);

  // Check 1-hour cooldown unless forceSend is active
  if (!forceSend && now - lastAlertSentAt < ONE_HOUR_MS) {
    const minutesRemaining = Math.ceil((ONE_HOUR_MS - (now - lastAlertSentAt)) / 60000);
    console.warn(
      `[Redis Alert Cooldown] Email suppressed. Next alert eligible in ${minutesRemaining} minutes.`
    );
    return false;
  }

  // Update timestamp immediately
  lastAlertSentAt = now;

  const timestamp = new Date().toLocaleString("ar-JO", {
    timeZone: "Asia/Amman",
    dateStyle: "full",
    timeStyle: "medium",
  });

  const subject = forceSend
    ? "[Nasaq Gym Test] Redis Failure Simulation Alert"
    : "[Nasaq Gym Alert] Redis Connection/Quota Limit Error";

  const textBody = `
تحذير: خطأ في نظام التخزين المؤقت Redis - Nasaq Gym

التوقيت: ${timestamp}
السياق: ${context}
تفاصيل الخطأ: ${errorMessage}

الإجراء المتخذ:
تم تفعيل نظام التراجع الكامل (Full Fallback) إلى قاعدة بيانات Airtable تلقائياً.
تستمر جميع عمليات تسجيل الدخول والبيانات في العمل بنجاح بدون أي انقطاع (Zero-Downtime).

${forceSend ? "ملاحظة: هذا بريد تجريبي تم إطلاقه عبر معلمة الاختبار ?test_redis_error=true." : "ملاحظة: هذا التنبيه محدد بمعدل رسالة واحدة كحد أقصى كل 60 دقيقة لمنع الإزعاج."}
  `.trim();

  const htmlBody = `
    <div dir="rtl" style="font-family: Arial, Tahoma, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 12px; background: #ffffff; color: #1f2937;">
      <div style="border-bottom: 2px solid ${forceSend ? "#3b82f6" : "#ef4444"}; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="color: ${forceSend ? "#1d4ed8" : "#b91c1c"}; margin: 0; font-size: 22px;">
          ${forceSend ? "🧪 بريد تجريبي: محاكاة عطل Redis" : "🚨 إنذار فوري: عطل في نظام Redis"}
        </h2>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Nasaq Gym - Notification System</p>
      </div>

      <p style="font-size: 15px; line-height: 1.6;">
        تم رصد ${forceSend ? "طلب اختبار لمحاكاة خطأ" : "خطأ أو تجاوز في الحصة المحددة"} لـ <strong>Redis</strong> في تطبيق نسق جيم.
      </p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px; border: 1px solid #f3f4f6;">
        <tr style="background: #f9fafb;">
          <td style="padding: 10px; font-weight: bold; width: 130px; border-bottom: 1px solid #e5e7eb;">التوقيت:</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${timestamp}</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold; background: #f9fafb; border-bottom: 1px solid #e5e7eb;">العملية / السياق:</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${context}</td>
        </tr>
        <tr style="background: #fef2f2;">
          <td style="padding: 10px; font-weight: bold; color: #991b1b; border-bottom: 1px solid #fecaca;">رسالة الخطأ:</td>
          <td style="padding: 10px; color: #b91c1c; font-family: monospace; direction: ltr; text-align: left; border-bottom: 1px solid #fecaca;"><code>${errorMessage}</code></td>
        </tr>
        <tr style="background: #f0fdf4;">
          <td style="padding: 10px; font-weight: bold; color: #166534;">حالة النظام:</td>
          <td style="padding: 10px; color: #15803d; font-weight: bold;">✅ نشط (تم التراجع الكامل إلى Airtable بنجاح)</td>
        </tr>
      </table>

      <div style="background: #fffbeb; padding: 14px; border-right: 4px solid #f59e0b; border-radius: 6px; margin: 20px 0; font-size: 13px; color: #92400e; line-height: 1.6;">
        <strong>معلومة هامة:</strong> يستمر التطبيق في خدمة المشتركين والمدربين بشكل طبيعي بنسبة 100% عبر قاعدة بيانات Airtable. تم ضبط التنبيهات بمعدل رسالة واحدة كحد أقصى كل 60 دقيقة.
      </div>

      <div style="text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 14px; margin-top: 20px;">
        تم الإرسال تلقائياً إلى: ${RECEIVER_EMAILS.join(", ")}
      </div>
    </div>
  `;

  try {
    const success = await sendSmtpEmail({
      to: RECEIVER_EMAILS,
      subject,
      text: textBody,
      html: htmlBody,
    });

    if (success) {
      console.log(
        `[Redis Alert Service] ✅ Alert email sent via SMTP to ${RECEIVER_EMAILS.join(", ")}`
      );
      return true;
    } else {
      console.warn("[Redis Alert Service] ⚠️ SMTP transport returned false.");
      return false;
    }
  } catch (alertErr) {
    console.error("[Redis Alert Service] ❌ Failed to dispatch SMTP alert email:", alertErr);
    return false;
  }
}

/**
 * Reports that Redis has successfully executed an operation,
 * resetting the error state after recovery.
 */
export function reportRedisSuccess(): void {
  if (isRedisInErrorState) {
    console.log("[Redis Alert Service] ✅ Redis operation succeeded. System recovered.");
    isRedisInErrorState = false;
  }
}

/**
 * Helper to inspect current alert state.
 */
export function getAlertStatus() {
  return {
    lastAlertSentAt,
    isRedisInErrorState,
    recipients: RECEIVER_EMAILS,
    cooldownMs: ONE_HOUR_MS,
  };
}
