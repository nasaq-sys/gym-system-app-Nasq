/**
 * Ultra Gym - Workout Rest Timer Engine
 * Authoritative timestamp-based timer engine shared across Web, PWA, Android, and iOS.
 *
 * Core Principle:
 * The authoritative remaining time is ALWAYS calculated from `endsAt - Date.now()`.
 * Never rely on decremented intervals as source of truth.
 */

export const REST_TIMER_SCHEMA_VERSION = 1;
export const REST_TIMER_STORAGE_KEY = "ug_active_rest_timer_v1";
export const REST_TIMER_SETTINGS_KEY = "ug_rest_timer_settings_v1";
export const REST_TIMER_APP_GROUP = "group.com.ultragym.app";

export type RestTimerStatus = "running" | "paused" | "completed" | "cancelled";

export interface ActiveRestTimer {
  id: string;
  userId: string;
  workoutId: string;
  exerciseId: string;
  exerciseName?: string;
  durationSeconds: number;
  startedAt: number;
  endsAt: number;
  status: RestTimerStatus;
  completionHandled: boolean;
  schemaVersion: number;
}

export interface RestTimerSettings {
  persistentNotificationEnabled: boolean;
  floatingOverlayEnabled: boolean;
  liveActivityEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  hideExerciseName: boolean;
  hideMemberName?: boolean;
  hideBodyMeasurements?: boolean;
  hideSubscriptionDetails?: boolean;
  showEndRestAction: boolean;
  autoStartOnSetRecord: boolean;
  defaultDurationSeconds: number;
}

export const DEFAULT_REST_TIMER_SETTINGS: RestTimerSettings = {
  persistentNotificationEnabled: true,
  floatingOverlayEnabled: false, // Disabled by default; requires explicit user permission
  liveActivityEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  hideExerciseName: false,
  hideMemberName: false,
  hideBodyMeasurements: false,
  hideSubscriptionDetails: false,
  showEndRestAction: true,
  autoStartOnSetRecord: true,
  defaultDurationSeconds: 60,
};

/**
 * Calculates remaining seconds strictly from the target endsAt timestamp.
 * Returns an integer >= 0.
 */
export function calculateRemainingSeconds(endsAt: number): number {
  if (!endsAt || isNaN(endsAt)) return 0;
  const diff = endsAt - Date.now();
  if (diff <= 0) return 0;
  return Math.max(0, Math.ceil(diff / 1000));
}

/**
 * Calculates percentage of progress completed (0 to 100).
 */
export function calculateProgressPercentage(
  startedAt: number,
  endsAt: number,
  durationSeconds: number
): number {
  if (!endsAt || !startedAt || durationSeconds <= 0) return 100;
  const remaining = calculateRemainingSeconds(endsAt);
  const total = Math.max(durationSeconds, Math.ceil((endsAt - startedAt) / 1000));
  if (total <= 0) return 100;
  const completed = total - remaining;
  return Math.min(100, Math.max(0, (completed / total) * 100));
}

/**
 * Formats seconds into MM:SS string.
 */
export function formatTimerDisplay(seconds: number): string {
  const safeSecs = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSecs / 60);
  const secs = safeSecs % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Creates an authoritative new ActiveRestTimer instance optimistically.
 */
export function createRestTimer(params: {
  durationSeconds?: number;
  exerciseName?: string;
  exerciseId?: string;
  workoutId?: string;
  userId?: string;
  id?: string;
}): ActiveRestTimer {
  const durationSeconds = Math.max(5, params.durationSeconds ?? 60);
  const now = Date.now();
  const endsAt = now + durationSeconds * 1000;

  return {
    id: params.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `timer_${now}_${Math.random().toString(36).slice(2, 8)}`),
    userId: params.userId || "anonymous",
    workoutId: params.workoutId || "active_workout",
    exerciseId: params.exerciseId || "active_exercise",
    exerciseName: params.exerciseName,
    durationSeconds,
    startedAt: now,
    endsAt,
    status: "running",
    completionHandled: false,
    schemaVersion: REST_TIMER_SCHEMA_VERSION,
  };
}

/**
 * Adjusts an active timer by delta seconds (+15s, -15s, etc.)
 */
export function adjustTimerDuration(
  currentTimer: ActiveRestTimer,
  deltaSeconds: number
): ActiveRestTimer {
  const currentRemaining = calculateRemainingSeconds(currentTimer.endsAt);
  const newRemaining = Math.max(0, currentRemaining + deltaSeconds);
  const newEndsAt = Date.now() + newRemaining * 1000;
  const newDuration = Math.max(currentTimer.durationSeconds, newRemaining);

  return {
    ...currentTimer,
    endsAt: newEndsAt,
    durationSeconds: newDuration,
    status: newRemaining > 0 ? "running" : "completed",
    completionHandled: newRemaining > 0 ? false : currentTimer.completionHandled,
  };
}

/**
 * Serializes timer for safe cross-platform storage (Web, Android SharedPreferences, iOS App Group).
 */
export function serializeRestTimer(timer: ActiveRestTimer | null): string {
  if (!timer) return "";
  return JSON.stringify(timer);
}

/**
 * Deserializes and validates stored timer data.
 * Rejects corrupted or outdated incompatible data safely.
 */
export function deserializeRestTimer(raw: string | null | undefined): ActiveRestTimer | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.id || !parsed.endsAt || typeof parsed.endsAt !== "number") return null;

    // Schema migration / fallback
    const schemaVersion = parsed.schemaVersion || 1;
    if (schemaVersion > REST_TIMER_SCHEMA_VERSION) {
      // Future version, proceed with caution or ignore
    }

    const timer: ActiveRestTimer = {
      id: String(parsed.id),
      userId: String(parsed.userId || "anonymous"),
      workoutId: String(parsed.workoutId || "active_workout"),
      exerciseId: String(parsed.exerciseId || "active_exercise"),
      exerciseName: parsed.exerciseName ? String(parsed.exerciseName) : undefined,
      durationSeconds: Number(parsed.durationSeconds) || 60,
      startedAt: Number(parsed.startedAt) || (parsed.endsAt - 60000),
      endsAt: Number(parsed.endsAt),
      status: (parsed.status as RestTimerStatus) || "running",
      completionHandled: Boolean(parsed.completionHandled),
      schemaVersion: REST_TIMER_SCHEMA_VERSION,
    };

    return timer;
  } catch {
    return null;
  }
}

/**
 * Constructs deep link URL for native notification / widget / overlay actions.
 */
export function buildRestTimerDeepLink(action: "open" | "add15" | "end", timerId?: string): string {
  const base = "ultragym://workout";
  const params = new URLSearchParams();
  params.set("action", action);
  if (timerId) params.set("timerId", timerId);
  return `${base}?${params.toString()}`;
}
