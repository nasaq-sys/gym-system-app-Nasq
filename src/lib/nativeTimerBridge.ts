/**
 * Ultra Gym - Native Timer Bridge
 * Coordinates timer events between the Next.js / Web layer and
 * native Android / iOS plugins (Capacitor) with seamless PWA / Web fallback.
 */

import {
  ActiveRestTimer,
  RestTimerSettings,
  REST_TIMER_STORAGE_KEY,
  REST_TIMER_SETTINGS_KEY,
  serializeRestTimer,
  DEFAULT_REST_TIMER_SETTINGS,
} from "./workoutTimerEngine";

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
      Plugins?: {
        WorkoutRestTimerPlugin?: {
          startTimer: (options: {
            timerJson: string;
            settingsJson: string;
          }) => Promise<{ success: boolean }>;
          updateTimer: (options: {
            timerJson: string;
          }) => Promise<{ success: boolean }>;
          stopTimer: (options: {
            timerId?: string;
          }) => Promise<{ success: boolean }>;
          syncSettings: (options: {
            settingsJson: string;
          }) => Promise<{ success: boolean }>;
          checkOverlayPermission: () => Promise<{ granted: boolean }>;
          requestOverlayPermission: () => Promise<{ granted: boolean }>;
        };
      };
    };
  }
}

export class NativeTimerBridge {
  private static isPluginAvailable(): boolean {
    return (
      typeof window !== "undefined" &&
      Boolean(window.Capacitor?.isNativePlatform?.()) &&
      Boolean(window.Capacitor?.Plugins?.WorkoutRestTimerPlugin)
    );
  }

  public static isNativePlatform(): boolean {
    return (
      typeof window !== "undefined" &&
      Boolean(window.Capacitor?.isNativePlatform?.())
    );
  }

  public static getPlatform(): "android" | "ios" | "web" {
    if (typeof window === "undefined") return "web";
    const plat = window.Capacitor?.getPlatform?.();
    if (plat === "android") return "android";
    if (plat === "ios") return "ios";
    return "web";
  }

  /**
   * Starts a background native timer (Android Foreground Service / iOS Live Activity)
   * or synchronizes with PWA / LocalStorage.
   */
  public static async startTimer(
    timer: ActiveRestTimer,
    settings: RestTimerSettings
  ): Promise<boolean> {
    // 1. Save to local storage for web/PWA layer
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(REST_TIMER_STORAGE_KEY, serializeRestTimer(timer));
      }
    } catch {
      // ignore
    }

    // 2. Dispatch to Native Android / iOS Plugin if available
    if (this.isPluginAvailable()) {
      try {
        const res = await window.Capacitor!.Plugins!.WorkoutRestTimerPlugin!.startTimer({
          timerJson: serializeRestTimer(timer),
          settingsJson: JSON.stringify(settings),
        });
        return res.success;
      } catch (err) {
        console.warn("[NativeTimerBridge] Failed to start native timer:", err);
      }
    }

    // 3. Web / PWA fallback notification setup
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    return true;
  }

  /**
   * Updates an ongoing timer (+15s, -15s, etc.) across native and web surfaces.
   */
  public static async updateTimer(timer: ActiveRestTimer): Promise<boolean> {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(REST_TIMER_STORAGE_KEY, serializeRestTimer(timer));
      }
    } catch {
      // ignore
    }

    if (this.isPluginAvailable()) {
      try {
        const res = await window.Capacitor!.Plugins!.WorkoutRestTimerPlugin!.updateTimer({
          timerJson: serializeRestTimer(timer),
        });
        return res.success;
      } catch (err) {
        console.warn("[NativeTimerBridge] Failed to update native timer:", err);
      }
    }

    return true;
  }

  /**
   * Stops/cancels timer and removes all native background surfaces.
   */
  public static async stopTimer(timerId?: string): Promise<boolean> {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem(REST_TIMER_STORAGE_KEY);
      }
    } catch {
      // ignore
    }

    if (this.isPluginAvailable()) {
      try {
        const res = await window.Capacitor!.Plugins!.WorkoutRestTimerPlugin!.stopTimer({
          timerId,
        });
        return res.success;
      } catch (err) {
        console.warn("[NativeTimerBridge] Failed to stop native timer:", err);
      }
    }

    return true;
  }

  /**
   * Synchronizes user preferences with native background services.
   */
  public static async syncSettings(settings: RestTimerSettings): Promise<boolean> {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(REST_TIMER_SETTINGS_KEY, JSON.stringify(settings));
      }
    } catch {
      // ignore
    }

    if (this.isPluginAvailable()) {
      try {
        const res = await window.Capacitor!.Plugins!.WorkoutRestTimerPlugin!.syncSettings({
          settingsJson: JSON.stringify(settings),
        });
        return res.success;
      } catch (err) {
        console.warn("[NativeTimerBridge] Failed to sync settings with native layer:", err);
      }
    }

    return true;
  }

  /**
   * Loads saved settings from storage.
   */
  public static loadSavedSettings(): RestTimerSettings {
    if (typeof window === "undefined") return DEFAULT_REST_TIMER_SETTINGS;
    try {
      const raw = localStorage.getItem(REST_TIMER_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_REST_TIMER_SETTINGS, ...parsed };
      }
    } catch {}
    return DEFAULT_REST_TIMER_SETTINGS;
  }

  /**
   * Checks if Android Floating Overlay (SYSTEM_ALERT_WINDOW) permission is granted.
   */
  public static async checkOverlayPermission(): Promise<boolean> {
    if (this.getPlatform() !== "android") return false;
    if (this.isPluginAvailable()) {
      try {
        const res = await window.Capacitor!.Plugins!.WorkoutRestTimerPlugin!.checkOverlayPermission();
        return res.granted;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Requests Android Floating Overlay permission by opening system settings.
   */
  public static async requestOverlayPermission(): Promise<boolean> {
    if (this.getPlatform() !== "android") return false;
    if (this.isPluginAvailable()) {
      try {
        const res = await window.Capacitor!.Plugins!.WorkoutRestTimerPlugin!.requestOverlayPermission();
        return res.granted;
      } catch {
        return false;
      }
    }
    return false;
  }
}
