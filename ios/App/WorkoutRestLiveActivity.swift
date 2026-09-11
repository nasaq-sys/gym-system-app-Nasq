import SwiftUI
import WidgetKit
import ActivityKit

@available(iOS 16.1, *)
struct WorkoutRestLiveActivity: Widget {
    let brandOrange = Color(red: 1.0, green: 0.353, blue: 0.039) // #FF5A0A
    let obsidianDark = Color(red: 0.07, green: 0.07, blue: 0.08)
    let cardBackground = Color(red: 0.12, green: 0.12, blue: 0.14)

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutRestAttributes.self) { context in
            // ── Lock Screen Live Activity Banner ──
            VStack(alignment: .leading, spacing: 10) {
                // Header Bar
                HStack {
                    HStack(spacing: 6) {
                        Image(systemName: context.state.mode == .resting ? "timer" : "dumbbell.fill")
                            .foregroundColor(brandOrange)
                            .font(.system(size: 13, weight: .bold))

                        Text(context.state.mode == .resting ? "Ultra Gym · راحة التمرين" : "Ultra Gym · تمرين مباشر")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                    }

                    Spacer()

                    Text(context.state.workoutName)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Color.white.opacity(0.6))
                        .lineLimit(1)
                }

                // Main Content Body
                if context.state.mode == .resting, let endsAt = context.state.endsAt, endsAt > Date() {
                    // ── RESTING MODE: Live countdown banner ──
                    HStack(alignment: .center) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(timerInterval: Date()...endsAt, countsDown: true)
                                .font(.system(size: 34, weight: .black, design: .rounded))
                                .foregroundColor(brandOrange)
                                .monospacedDigit()

                            Text("القادم: مجموعة \(context.state.currentSet) في \(context.state.exerciseName)")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(.gray)
                                .lineLimit(1)
                        }

                        Spacer()

                        Link(destination: URL(string: "ultragym://widget?action=rest")!) {
                            HStack(spacing: 4) {
                                Text("إنهاء الراحة")
                                    .font(.system(size: 12, weight: .bold))
                                Image(systemName: "forward.fill")
                                    .font(.system(size: 10, weight: .bold))
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(brandOrange)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                        }
                    }
                } else {
                    // ── EXERCISING MODE: Live set progress banner ──
                    HStack(alignment: .center) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(context.state.exerciseName)
                                .font(.system(size: 17, weight: .black))
                                .foregroundColor(.white)
                                .lineLimit(1)

                            HStack(spacing: 8) {
                                Text("المجموعة \(context.state.currentSet) من \(context.state.totalSets)")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(brandOrange)

                                if let weight = context.state.weightKg, weight > 0 {
                                    Text("•  \(String(format: "%.1f", weight)) كغ")
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(Color.white.opacity(0.8))
                                }

                                if let reps = context.state.targetReps, reps > 0 {
                                    Text("•  \(reps) تكرار")
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(Color.white.opacity(0.8))
                                }
                            }
                        }

                        Spacer()

                        Link(destination: URL(string: "ultragym://widget?action=workout")!) {
                            HStack(spacing: 4) {
                                Text("فتح التمرين")
                                    .font(.system(size: 12, weight: .bold))
                                Image(systemName: "chevron.left")
                                    .font(.system(size: 10, weight: .bold))
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(brandOrange.opacity(0.18))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(brandOrange.opacity(0.5), lineWidth: 1)
                            )
                            .foregroundColor(brandOrange)
                            .cornerRadius(12)
                        }
                    }

                    // Progress Bar
                    VStack(alignment: .leading, spacing: 3) {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(Color.white.opacity(0.12))
                                    .frame(height: 4)

                                RoundedRectangle(cornerRadius: 3)
                                    .fill(brandOrange)
                                    .frame(width: max(0, min(geo.size.width, geo.size.width * CGFloat(context.state.progressPercentage) / 100.0)), height: 4)
                            }
                        }
                        .frame(height: 4)

                        HStack {
                            Text("تمرين \(context.state.completedExercises + 1) من \(max(1, context.state.totalExercises))")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.gray)

                            Spacer()

                            Text("\(context.state.progressPercentage)% مكتمل")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(brandOrange)
                        }
                    }
                }
            }
            .padding(16)
            .background(obsidianDark)
            .activityBackgroundTint(obsidianDark)
            .activitySystemActionForegroundColor(brandOrange)

        } dynamicIsland: { context in
            DynamicIsland {
                // ── Expanded Dynamic Island ──
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 4) {
                        Image(systemName: context.state.mode == .resting ? "timer" : "dumbbell.fill")
                            .foregroundColor(brandOrange)
                        Text("Ultra Gym")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                    }
                    .padding(.leading, 4)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.exerciseName)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Color.white.opacity(0.8))
                        .lineLimit(1)
                        .padding(.trailing, 4)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    if context.state.mode == .resting, let endsAt = context.state.endsAt, endsAt > Date() {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("فترة الاستشفاء بين المجموعات")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(.gray)

                                Text(timerInterval: Date()...endsAt, countsDown: true)
                                    .font(.system(size: 26, weight: .black, design: .rounded))
                                    .foregroundColor(brandOrange)
                                    .monospacedDigit()
                            }

                            Spacer()

                            Link(destination: URL(string: "ultragym://widget?action=rest")!) {
                                Text("إنهاء الراحة")
                                    .font(.system(size: 11, weight: .bold))
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(brandOrange)
                                    .foregroundColor(.white)
                                    .cornerRadius(10)
                            }
                        }
                        .padding(.horizontal, 6)
                        .padding(.top, 2)
                    } else {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("المجموعة \(context.state.currentSet) من \(context.state.totalSets) • \(context.state.progressPercentage)%")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(brandOrange)

                                if let w = context.state.weightKg, w > 0 {
                                    Text("\(String(format: "%.1f", w)) كغ • \(context.state.targetReps ?? 10) تكرار")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.white)
                                }
                            }

                            Spacer()

                            Link(destination: URL(string: "ultragym://widget?action=workout")!) {
                                Text("العودة للتمرين")
                                    .font(.system(size: 11, weight: .bold))
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(brandOrange)
                                    .foregroundColor(.white)
                                    .cornerRadius(10)
                            }
                        }
                        .padding(.horizontal, 6)
                        .padding(.top, 2)
                    }
                }
            } compactLeading: {
                // ── Compact Leading Icon ──
                Image(systemName: context.state.mode == .resting ? "timer" : "dumbbell.fill")
                    .foregroundColor(brandOrange)
                    .font(.system(size: 12, weight: .bold))
            } compactTrailing: {
                // ── Compact Trailing: Countdown or Set Info ──
                if context.state.mode == .resting, let endsAt = context.state.endsAt, endsAt > Date() {
                    Text(timerInterval: Date()...endsAt, countsDown: true)
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundColor(brandOrange)
                        .monospacedDigit()
                        .frame(width: 46)
                } else {
                    Text("\(context.state.currentSet)/\(context.state.totalSets)")
                        .font(.system(size: 12, weight: .black, design: .rounded))
                        .foregroundColor(brandOrange)
                        .monospacedDigit()
                }
            } minimal: {
                // ── Minimal Icon ──
                Image(systemName: context.state.mode == .resting ? "timer" : "dumbbell.fill")
                    .foregroundColor(brandOrange)
                    .font(.system(size: 12, weight: .bold))
            }
        }
    }
}
