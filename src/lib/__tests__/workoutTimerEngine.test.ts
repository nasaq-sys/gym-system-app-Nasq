/**
 * Ultra Gym - Workout Rest Timer Engine & Native Bridge Test Suite
 * Comprehensive automated tests covering all Phase 1-20 requirements.
 */

import {
  calculateRemainingSeconds,
  calculateProgressPercentage,
  formatTimerDisplay,
  createRestTimer,
  adjustTimerDuration,
  serializeRestTimer,
  deserializeRestTimer,
  buildRestTimerDeepLink,
  REST_TIMER_SCHEMA_VERSION,
  DEFAULT_REST_TIMER_SETTINGS,
  ActiveRestTimer,
} from "../workoutTimerEngine";
import { NativeTimerBridge } from "../nativeTimerBridge";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

console.log("=== Running Workout Rest Timer Engine & Native Bridge Tests ===");

// ── Test 1: Authoritative Remaining Seconds Calculation ──
{
  const now = Date.now();
  const endsAt60 = now + 60 * 1000;
  const remaining60 = calculateRemainingSeconds(endsAt60);
  assert(remaining60 >= 59 && remaining60 <= 60, `Test 1.1: Expected ~60s, got ${remaining60}`);

  const pastEndsAt = now - 5000;
  const remainingPast = calculateRemainingSeconds(pastEndsAt);
  assert(remainingPast === 0, `Test 1.2: Expected 0s for past timestamp, got ${remainingPast}`);

  const zeroEndsAt = calculateRemainingSeconds(0);
  assert(zeroEndsAt === 0, `Test 1.3: Expected 0s for 0 timestamp, got ${zeroEndsAt}`);

  const nanEndsAt = calculateRemainingSeconds(NaN);
  assert(nanEndsAt === 0, `Test 1.4: Expected 0s for NaN timestamp, got ${nanEndsAt}`);
  console.log("✓ Test 1 Passed: Authoritative remaining seconds calculation strictly from endsAt");
}

// ── Test 2: Progress Percentage Calculation ──
{
  const now = Date.now();
  const startedAt = now - 30 * 1000;
  const endsAt = now + 30 * 1000;
  const progress50 = calculateProgressPercentage(startedAt, endsAt, 60);
  assert(progress50 >= 45 && progress50 <= 55, `Test 2.1: Expected ~50% progress, got ${progress50}`);

  const progressDone = calculateProgressPercentage(now - 60000, now - 1000, 60);
  assert(progressDone === 100, `Test 2.2: Expected 100% progress for finished timer, got ${progressDone}`);
  console.log("✓ Test 2 Passed: Progress percentage calculation");
}

// ── Test 3: Time Formatting (MM:SS) ──
{
  assert(formatTimerDisplay(0) === "00:00", "Test 3.1: 0 -> 00:00");
  assert(formatTimerDisplay(9) === "00:09", "Test 3.2: 9 -> 00:09");
  assert(formatTimerDisplay(60) === "01:00", "Test 3.3: 60 -> 01:00");
  assert(formatTimerDisplay(125) === "02:05", "Test 3.4: 125 -> 02:05");
  assert(formatTimerDisplay(-5) === "00:00", "Test 3.5: -5 -> 00:00");
  console.log("✓ Test 3 Passed: Timer display string formatting");
}

// ── Test 4: Optimistic Timer Creation ──
{
  const startTimestamp = Date.now();
  const timer = createRestTimer({
    durationSeconds: 90,
    exerciseName: "Bench Press",
    exerciseId: "ex_123",
    workoutId: "wk_456",
    userId: "usr_789",
  });

  assert(Boolean(timer.id), "Test 4.1: Timer must have valid unique ID");
  assert(timer.durationSeconds === 90, "Test 4.2: Duration must match");
  assert(timer.exerciseName === "Bench Press", "Test 4.3: Exercise name must match");
  assert(timer.status === "running", "Test 4.4: Status must be running");
  assert(timer.completionHandled === false, "Test 4.5: Completion must not be handled yet");
  assert(timer.schemaVersion === REST_TIMER_SCHEMA_VERSION, "Test 4.6: Schema version must be current");
  assert(timer.endsAt >= startTimestamp + 90000, "Test 4.7: endsAt must be properly set to 90s in future");
  console.log("✓ Test 4 Passed: Instant optimistic timer creation");
}

// ── Test 5: Dynamic Delta Duration Adjustments (+15s / -15s) ──
{
  const timer = createRestTimer({ durationSeconds: 30 });
  const initialEndsAt = timer.endsAt;

  // Add 15 seconds
  const timerPlus15 = adjustTimerDuration(timer, 15);
  assert(timerPlus15.endsAt >= initialEndsAt + 14000, "Test 5.1: endsAt increased by ~15s");
  const remainingPlus15 = calculateRemainingSeconds(timerPlus15.endsAt);
  assert(remainingPlus15 >= 44 && remainingPlus15 <= 45, `Test 5.2: Remaining increased to ~45s (got ${remainingPlus15})`);

  // Subtract 15 seconds
  const timerMinus15 = adjustTimerDuration(timerPlus15, -15);
  const remainingMinus15 = calculateRemainingSeconds(timerMinus15.endsAt);
  assert(remainingMinus15 >= 29 && remainingMinus15 <= 30, `Test 5.3: Remaining reduced back to ~30s (got ${remainingMinus15})`);

  // Subtract more than remaining (Clamp to 0)
  const timerClamped = adjustTimerDuration(timer, -100);
  assert(calculateRemainingSeconds(timerClamped.endsAt) === 0, "Test 5.4: Clamped to 0");
  assert(timerClamped.status === "completed", "Test 5.5: Status changed to completed");
  console.log("✓ Test 5 Passed: Dynamic delta duration adjustments (+15s / -15s)");
}

// ── Test 6: Serialization, Validation & Schema Migration ──
{
  const timer = createRestTimer({ durationSeconds: 60, exerciseName: "Squat" });
  const serialized = serializeRestTimer(timer);
  assert(typeof serialized === "string" && serialized.length > 0, "Test 6.1: Valid JSON string");

  const deserialized = deserializeRestTimer(serialized);
  assert(deserialized !== null, "Test 6.2: Deserialized object exists");
  assert(deserialized?.id === timer.id, "Test 6.3: IDs match");
  assert(deserialized?.endsAt === timer.endsAt, "Test 6.4: endsAt matches");
  assert(deserialized?.exerciseName === "Squat", "Test 6.5: exerciseName matches");

  // Corruption safety
  assert(deserializeRestTimer("") === null, "Test 6.6: Empty string returns null");
  assert(deserializeRestTimer("invalid json") === null, "Test 6.7: Invalid JSON returns null");
  assert(deserializeRestTimer("{}") === null, "Test 6.8: Missing required fields returns null");
  assert(deserializeRestTimer(null) === null, "Test 6.9: Null returns null");
  console.log("✓ Test 6 Passed: Serialization, validation, and corruption resistance");
}

// ── Test 7: Deep Link Generation & Actions ──
{
  const openLink = buildRestTimerDeepLink("open", "timer_123");
  assert(openLink === "ultragym://workout?action=open&timerId=timer_123", `Test 7.1: Open link generated: ${openLink}`);

  const add15Link = buildRestTimerDeepLink("add15", "timer_123");
  assert(add15Link === "ultragym://workout?action=add15&timerId=timer_123", `Test 7.2: Add15 link generated: ${add15Link}`);

  const endLink = buildRestTimerDeepLink("end", "timer_123");
  assert(endLink === "ultragym://workout?action=end&timerId=timer_123", `Test 7.3: End link generated: ${endLink}`);
  console.log("✓ Test 7 Passed: Deep link generation & URL schemes");
}

// ── Test 8: Process Death & Restart Simulation ──
{
  const originalStartedAt = Date.now() - 20000; // Started 20s ago
  const originalEndsAt = originalStartedAt + 60000; // Total 60s -> 40s remaining
  const savedTimer: ActiveRestTimer = {
    id: "surviving_timer_1",
    userId: "user_test",
    workoutId: "wk_test",
    exerciseId: "ex_test",
    exerciseName: "Deadlift",
    durationSeconds: 60,
    startedAt: originalStartedAt,
    endsAt: originalEndsAt,
    status: "running",
    completionHandled: false,
    schemaVersion: 1,
  };

  // Simulate storing, terminating process, and restoring
  const rawSaved = serializeRestTimer(savedTimer);
  const restored = deserializeRestTimer(rawSaved);
  assert(restored !== null, "Test 8.1: Restored timer exists");

  const remainingOnRestore = calculateRemainingSeconds(restored!.endsAt);
  assert(remainingOnRestore >= 39 && remainingOnRestore <= 40, `Test 8.2: Expected ~40s left, got ${remainingOnRestore}`);
  assert(restored!.durationSeconds === 60, "Test 8.3: Original duration preserved");
  console.log("✓ Test 8 Passed: Process death & restart simulation with accurate endsAt restoration");
}

// ── Test 9: Native Timer Bridge Fallback & Settings Sync ──
{
  const defaultSettings = NativeTimerBridge.loadSavedSettings();
  assert(defaultSettings.persistentNotificationEnabled === true, "Test 9.1: Default notification enabled");
  assert(defaultSettings.floatingOverlayEnabled === false, "Test 9.2: Floating overlay disabled by default");
  assert(defaultSettings.soundEnabled === true, "Test 9.3: Sound enabled");
  assert(defaultSettings.vibrationEnabled === true, "Test 9.4: Vibration enabled");

  const platform = NativeTimerBridge.getPlatform();
  assert(platform === "web" || platform === "android" || platform === "ios", "Test 9.5: Platform detected");
  console.log("✓ Test 9 Passed: Native Timer Bridge fallback and settings initialization");
}

console.log("\nALL 9 CORE TIMER TEST SUITES PASSED SUCCESSFULLY! ⏱️🔥✨\n");
