import Foundation
import ActivityKit

public enum WorkoutActivityMode: String, Codable {
    case exercising
    case resting
}

public struct WorkoutRestAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var mode: WorkoutActivityMode
        public var workoutName: String
        public var exerciseName: String
        public var currentSet: Int
        public var totalSets: Int
        public var targetReps: Int?
        public var weightKg: Double?
        public var endsAt: Date?
        public var completedExercises: Int
        public var totalExercises: Int
        public var progressPercentage: Int

        public init(
            mode: WorkoutActivityMode = .exercising,
            workoutName: String = "Ultra Gym Workout",
            exerciseName: String = "تمرين نشط",
            currentSet: Int = 1,
            totalSets: Int = 3,
            targetReps: Int? = 10,
            weightKg: Double? = nil,
            endsAt: Date? = nil,
            completedExercises: Int = 0,
            totalExercises: Int = 1,
            progressPercentage: Int = 0
        ) {
            self.mode = mode
            self.workoutName = workoutName
            self.exerciseName = exerciseName
            self.currentSet = currentSet
            self.totalSets = totalSets
            self.targetReps = targetReps
            self.weightKg = weightKg
            self.endsAt = endsAt
            self.completedExercises = completedExercises
            self.totalExercises = totalExercises
            self.progressPercentage = progressPercentage
        }
    }

    public var timerId: String
    public var workoutId: String

    public init(timerId: String, workoutId: String = "active_workout") {
        self.timerId = timerId
        self.workoutId = workoutId
    }
}
