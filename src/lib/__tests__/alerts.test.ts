import { triggerRedisErrorAlert, reportRedisSuccess, getAlertStatus } from "../alerts";

async function runAlertTests() {
  console.log("--- Testing Redis Error Alerting Service ---");

  // 1. Initial State
  const initial = getAlertStatus();
  console.assert(initial.recipients.includes("info@nasaqjo.com"), "Recipient 1 missing");
  console.assert(initial.recipients.includes("momenaborob@gmail.com"), "Recipient 2 missing");
  console.assert(initial.cooldownMs === 3600000, "Cooldown should be 1 hour");
  console.log("Initial state assertions passed:", initial);

  // 2. Trigger Error Alert
  console.log("\n--- Triggering Error Alert ---");
  await triggerRedisErrorAlert(new Error("Upstash quota exceeded (429)"), "Test Login Operation");
  
  const statusAfterFirst = getAlertStatus();
  console.assert(statusAfterFirst.isRedisInErrorState === true, "Error state should be true");
  console.assert(statusAfterFirst.lastAlertSentAt > 0, "lastAlertSentAt should be recorded");
  console.log("First alert processed. lastAlertSentAt:", statusAfterFirst.lastAlertSentAt);

  // 3. Cooldown Suppression Test (Immediate second trigger)
  console.log("\n--- Testing 1-Hour Cooldown Suppression ---");
  const previousTimestamp = statusAfterFirst.lastAlertSentAt;
  await triggerRedisErrorAlert(new Error("Connection refused"), "Concurrent Login");
  
  const statusAfterSuppressed = getAlertStatus();
  console.assert(statusAfterSuppressed.lastAlertSentAt === previousTimestamp, "Timestamp should not change during cooldown");
  console.log("Cooldown suppression verified: duplicate alert blocked successfully.");

  // 4. Recovery Test
  console.log("\n--- Testing Redis Recovery Reporting ---");
  reportRedisSuccess();
  const statusRecovered = getAlertStatus();
  console.assert(statusRecovered.isRedisInErrorState === false, "Error state should reset to false on recovery");
  console.log("Recovery state reset verified successfully.");

  console.log("\nAll Alert Service unit tests passed!");
}

runAlertTests().catch(console.error);
