import {
  parseDurationFromText,
  inferStandardTier,
  resolveSubscriptionPeriod,
} from "../subscriptionUtils";

// ── Test 1: parseDurationFromText ──
function testParseDurationFromText() {
  console.log("Testing parseDurationFromText...");
  if (parseDurationFromText("باقة سنوية") !== 365) throw new Error("Failed: باقة سنوية");
  if (parseDurationFromText("اشتراك سنة") !== 365) throw new Error("Failed: اشتراك سنة");
  if (parseDurationFromText("1 Year Package") !== 365) throw new Error("Failed: 1 Year");
  if (parseDurationFromText("اشتراك 6 شهور") !== 180) throw new Error("Failed: 6 شهور");
  if (parseDurationFromText("باقة 3 شهور") !== 90) throw new Error("Failed: 3 شهور");
  if (parseDurationFromText("Quarterly Subscription") !== 90) throw new Error("Failed: quarterly");
  if (parseDurationFromText("باقة شهرية") !== 30) throw new Error("Failed: باقة شهرية");
  if (parseDurationFromText("Monthly") !== 30) throw new Error("Failed: monthly");
  if (parseDurationFromText("أسبوع تجريبي") !== 7) throw new Error("Failed: أسبوع");
  console.log("✓ parseDurationFromText passed");
}

// ── Test 2: inferStandardTier ──
function testInferStandardTier() {
  console.log("Testing inferStandardTier...");
  if (inferStandardTier(238) !== 365) throw new Error("Failed: 238 days tier");
  if (inferStandardTier(120) !== 180) throw new Error("Failed: 120 days tier");
  if (inferStandardTier(50) !== 90) throw new Error("Failed: 50 days tier");
  if (inferStandardTier(20) !== 30) throw new Error("Failed: 20 days tier");
  console.log("✓ inferStandardTier passed");
}

// ── Test 3: resolveSubscriptionPeriod ──
function testResolveSubscriptionPeriod() {
  console.log("Testing resolveSubscriptionPeriod...");

  // Scenario A: 1-Year subscription with 238 days left
  const annualRes = resolveSubscriptionPeriod({
    planType: "اشتراك سنة",
    daysRemaining: "238",
  });
  if (annualRes.totalDays !== 365) throw new Error(`Expected 365 totalDays, got ${annualRes.totalDays}`);
  if (annualRes.daysLeft !== 238) throw new Error(`Expected 238 daysLeft, got ${annualRes.daysLeft}`);
  if (annualRes.percentageLeft !== 65) throw new Error(`Expected 65%, got ${annualRes.percentageLeft}%`);
  if (annualRes.daysElapsed !== 127) throw new Error(`Expected 127 daysElapsed, got ${annualRes.daysElapsed}`);
  if (annualRes.isExpired !== false) throw new Error("Expected isExpired to be false");

  // Scenario B: 3-Months subscription with 45 days left
  const quarterlyRes = resolveSubscriptionPeriod({
    planType: "اشتراك 3 شهور",
    daysRemaining: "45",
  });
  if (quarterlyRes.totalDays !== 90) throw new Error(`Expected 90 totalDays, got ${quarterlyRes.totalDays}`);
  if (quarterlyRes.daysLeft !== 45) throw new Error(`Expected 45 daysLeft, got ${quarterlyRes.daysLeft}`);
  if (quarterlyRes.percentageLeft !== 50) throw new Error(`Expected 50%, got ${quarterlyRes.percentageLeft}%`);
  if (quarterlyRes.daysElapsed !== 45) throw new Error(`Expected 45 daysElapsed, got ${quarterlyRes.daysElapsed}`);

  // Scenario C: 1-Month subscription with 10 days left
  const monthlyRes = resolveSubscriptionPeriod({
    planType: "باقة شهرية",
    daysRemaining: 10,
  });
  if (monthlyRes.totalDays !== 30) throw new Error(`Expected 30 totalDays, got ${monthlyRes.totalDays}`);
  if (monthlyRes.daysLeft !== 10) throw new Error(`Expected 10 daysLeft, got ${monthlyRes.daysLeft}`);
  if (monthlyRes.percentageLeft !== 33) throw new Error(`Expected 33%, got ${monthlyRes.percentageLeft}%`);

  // Scenario D: Expired member
  const expiredRes = resolveSubscriptionPeriod({
    subStatus: "منتهي",
    daysRemaining: 0,
  });
  if (expiredRes.isExpired !== true) throw new Error("Expected isExpired to be true");
  if (expiredRes.fraction !== 0) throw new Error("Expected fraction to be 0");
  if (expiredRes.percentageLeft !== 0) throw new Error("Expected percentageLeft to be 0");

  console.log("✓ resolveSubscriptionPeriod passed");
}

function runAll() {
  testParseDurationFromText();
  testInferStandardTier();
  testResolveSubscriptionPeriod();
  console.log("All subscriptionUtils tests passed successfully!");
}

runAll();
