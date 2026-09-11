"use client";

/**
 * Web Audio API & Haptics utility for rest timers
 * Generates lightweight, zero-dependency audio tones and vibration feedback.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtx && AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Play a single clean sine beep
 */
export function playBeep(enabled = true, freq = 880, duration = 0.15, startTimeOffset = 0): void {
  if (!enabled || typeof window === "undefined") return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.value = freq;

    const t0 = ctx.currentTime + startTimeOffset;
    gain.gain.setValueAtTime(0.001, t0);
    gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  } catch {
    // ignore audio playback errors
  }
}

/**
 * Play a distinct pleasant double-chime when rest time completes
 */
export function playSuccessChime(enabled = true): void {
  if (!enabled || typeof window === "undefined") return;
  try {
    playBeep(enabled, 659.25, 0.12, 0); // E5
    playBeep(enabled, 880.0, 0.25, 0.15); // A5
  } catch {
    // ignore
  }
}

/**
 * Trigger vibration pattern on supported mobile devices
 */
export function triggerVibrate(pattern: number | number[] = [200, 100, 200]): void {
  if (typeof window === "undefined") return;
  try {
    if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // ignore vibration errors
  }
}
