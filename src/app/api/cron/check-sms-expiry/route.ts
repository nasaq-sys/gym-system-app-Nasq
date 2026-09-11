import { NextResponse } from "next/server";
import { sendExpirationSms } from "@/lib/smsService";
import {
  getDueExpirations,
  getExpirationMemberData,
  removeExpiryEntry,
} from "@/lib/smsExpiryIndex";
import { incrementSmsSkipped } from "@/lib/smsMetrics";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/check-sms-expiry
 *
 * Scheduled cron endpoint that fires expiration SMS for subscriptions
 * whose expiry date has passed.
 *
 * Authentication: CRON_SECRET env var (same as /api/cron/check-subscriptions).
 * Can be called via Netlify Scheduled Functions, Vercel Cron, GitHub Actions,
 * or any HTTP scheduler.
 *
 * IMPORTANT — ZERO Airtable reads:
 * - Reads due subscriptions from Redis Sorted Set (ultra-gym:sms:expiry-index)
 * - Reads member name/phone from Redis SMS cache (ultra-gym:sms:member-cache:*)
 * - If member not in cache, SMS is skipped (logged) — NOT read from Airtable
 *
 * This is intentional per architecture requirements:
 * Members who log in regularly (2-min soft TTL) will always be cached.
 * Inactive members without cached data will receive SMS on next cron run
 * once they're cached again (e.g., via a login or refresh).
 *
 * Idempotency:
 * - Each expiration SMS has a Redis idempotency key (SET NX, 90-day TTL)
 * - Running this cron multiple times sends each SMS exactly once
 * - Entry is removed from the sorted set AFTER D7 accepts the message
 */
export async function GET(request: Request) {
  try {
    // ── Auth check ─────────────────────────────────────────────────────────
    const authHeader = request.headers.get("authorization");
    const { searchParams } = new URL(request.url);
    const cronSecret = process.env.CRON_SECRET;
    const queryKey = searchParams.get("key");

    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && queryKey !== cronSecret) {
      return NextResponse.json({ message: "Unauthorized cron execution" }, { status: 401 });
    }

    const now = Date.now();

    // ── Get due expirations from Redis (0 Airtable reads) ──────────────────
    const dueEntries = await getDueExpirations(now);

    const results = {
      checked: dueEntries.length,
      sent: 0,
      skipped: 0,
      failed: 0,
      reasons: [] as string[],
    };

    if (dueEntries.length === 0) {
      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        data: results,
        message: "No due expirations found",
      });
    }

    // ── Process each due expiration ─────────────────────────────────────────
    for (const entry of dueEntries) {
      const { subscriptionId, memberId, expiryTimestampMs } = entry;
      const expiryDate = new Date(expiryTimestampMs).toISOString().slice(0, 10);

      // Fetch member data from Redis cache — NEVER from Airtable
      const memberData = await getExpirationMemberData(memberId);

      if (!memberData) {
        // Member not in cache — skip and leave entry for next run
        results.skipped++;
        results.reasons.push(`member_not_cached:${memberId.slice(0, 8)}`);
        await incrementSmsSkipped("member_not_cached");
        continue;
      }

      // Send expiration SMS (idempotent — will not duplicate)
      const smsResult = await sendExpirationSms({
        memberId,
        memberName: memberData.memberName,
        phone: memberData.phone,
        subscriptionId,
        expiryDate,
      });

      if (smsResult.sent) {
        results.sent++;
        // Remove from sorted set — this subscription's expiry SMS is done
        await removeExpiryEntry(subscriptionId, memberId).catch((err) => {
          console.warn(
            `[check-sms-expiry] Failed to remove entry after send — will retry:`,
            err
          );
        });
      } else if (smsResult.skipped === "already_sent") {
        // Idempotency guard triggered — clean up the stale index entry
        results.skipped++;
        await removeExpiryEntry(subscriptionId, memberId).catch(() => {});
      } else if (smsResult.skipped === "invalid_phone") {
        results.skipped++;
        results.reasons.push(`invalid_phone:${subscriptionId.slice(0, 8)}`);
        // Remove entry — invalid phone won't self-heal
        await removeExpiryEntry(subscriptionId, memberId).catch(() => {});
      } else {
        // Transient failure — leave entry in sorted set for retry on next run
        results.failed++;
        results.reasons.push(`failed:${subscriptionId.slice(0, 8)}`);
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: results,
    });
  } catch (error) {
    console.error("[CronCheckSmsExpiry] Error:", error);
    return NextResponse.json(
      { message: "SMS expiry check failed", error: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
