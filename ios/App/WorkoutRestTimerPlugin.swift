import Foundation
import Capacitor
import ActivityKit

@objc(WorkoutRestTimerPlugin)
public class WorkoutRestTimerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorkoutRestTimerPlugin"
    public let jsName = "WorkoutRestTimerPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startTimer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateTimer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopTimer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncSettings", returnType: CAPPluginReturnPromise)
    ]

    private var currentActivity: Any?

    @objc func startTimer(_ call: CAPPluginCall) {
        guard let timerJsonStr = call.getString("timerJson"),
              let timerData = timerJsonStr.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: timerData) as? [String: Any] else {
            call.reject("Must provide valid timerJson")
            return
        }

        let timerId = json["id"] as? String ?? UUID().uuidString
        let endsAtTimestamp = json["endsAt"] as? Double ?? (Date().timeIntervalSince1970 * 1000 + 60000)
        let endsAt = Date(timeIntervalSince1970: endsAtTimestamp / 1000.0)
        let exerciseName = json["exerciseName"] as? String ?? "راحة التمرين"
        let durationSeconds = json["durationSeconds"] as? Int ?? 60

        // Sync with shared App Group
        if let defaults = UserDefaults(suiteName: "group.com.ultragym.app") {
            defaults.set(true, forKey: "is_active")
            defaults.set(exerciseName, forKey: "exercise_name")
            defaults.set(endsAtTimestamp, forKey: "ends_at")
            defaults.synchronize()
        }

        // Start ActivityKit Live Activity on iOS 16.1+
        if #available(iOS 16.1, *) {
            let attributes = WorkoutRestAttributes(timerId: timerId)
            let initialContentState = WorkoutRestAttributes.ContentState(
                mode: .resting,
                workoutName: "Ultra Gym",
                exerciseName: exerciseName,
                currentSet: 1,
                totalSets: 3,
                targetReps: 10,
                weightKg: nil,
                endsAt: endsAt,
                completedExercises: 0,
                totalExercises: 1,
                progressPercentage: 0
            )

            do {
                if #available(iOS 16.2, *) {
                    let activity = try Activity.request(
                        attributes: attributes,
                        content: .init(state: initialContentState, staleDate: nil)
                    )
                    self.currentActivity = activity
                } else {
                    let activity = try Activity.request(
                        attributes: attributes,
                        contentState: initialContentState
                    )
                    self.currentActivity = activity
                }
            } catch {
                print("Failed to start Live Activity: \(error)")
            }
        }

        call.resolve(["success": true])
    }

    @objc func updateTimer(_ call: CAPPluginCall) {
        guard let timerJsonStr = call.getString("timerJson"),
              let timerData = timerJsonStr.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: timerData) as? [String: Any] else {
            call.reject("Must provide valid timerJson")
            return
        }

        let endsAtTimestamp = json["endsAt"] as? Double ?? (Date().timeIntervalSince1970 * 1000 + 60000)
        let endsAt = Date(timeIntervalSince1970: endsAtTimestamp / 1000.0)
        let exerciseName = json["exerciseName"] as? String ?? "راحة التمرين"

        if let defaults = UserDefaults(suiteName: "group.com.ultragym.app") {
            defaults.set(endsAtTimestamp, forKey: "ends_at")
            defaults.synchronize()
        }

        if #available(iOS 16.1, *) {
            if let activity = currentActivity as? Activity<WorkoutRestAttributes> {
                let updatedContentState = WorkoutRestAttributes.ContentState(
                    mode: .resting,
                    workoutName: "Ultra Gym",
                    exerciseName: exerciseName,
                    currentSet: 1,
                    totalSets: 3,
                    targetReps: 10,
                    weightKg: nil,
                    endsAt: endsAt,
                    completedExercises: 0,
                    totalExercises: 1,
                    progressPercentage: 0
                )
                Task {
                    if #available(iOS 16.2, *) {
                        await activity.update(.init(state: updatedContentState, staleDate: nil))
                    } else {
                        await activity.update(using: updatedContentState)
                    }
                }
            }
        }

        call.resolve(["success": true])
    }

    @objc func stopTimer(_ call: CAPPluginCall) {
        if let defaults = UserDefaults(suiteName: "group.com.ultragym.app") {
            defaults.set(false, forKey: "is_active")
            defaults.removeObject(forKey: "ends_at")
            defaults.synchronize()
        }

        if #available(iOS 16.1, *) {
            if let activity = currentActivity as? Activity<WorkoutRestAttributes> {
                Task {
                    await activity.end(dismissalPolicy: .immediate)
                }
                currentActivity = nil
            }
        }

        call.resolve(["success": true])
    }

    @objc func syncSettings(_ call: CAPPluginCall) {
        if let settingsJson = call.getString("settingsJson"),
           let defaults = UserDefaults(suiteName: "group.com.ultragym.app") {
            defaults.set(settingsJson, forKey: "settings")
            defaults.synchronize()
        }
        call.resolve(["success": true])
    }
}
