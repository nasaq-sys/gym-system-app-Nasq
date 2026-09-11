import { z } from "zod";

const noHtmlRegex = /^[^<>]*$/;
const noHtmlMessage = "HTML tags and scripts (<, >) are strictly forbidden to prevent XSS";

export const scheduleItemSchema = z.object({
  exerciseId: z
    .string({ message: "Exercise ID is required" })
    .trim()
    .min(1, { message: "Exercise ID cannot be empty" })
    .max(100, { message: "Exercise ID is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage }),
  // Legacy combined text — still accepted so old clients don't break, but
  // new UI writes reps/sets as separate numbers instead.
  repsSets: z
    .string()
    .trim()
    .max(100, { message: "Reps/Sets text is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional(),
  reps: z
    .number({ message: "Reps must be a number" })
    .int()
    .nonnegative()
    .max(1000)
    .optional(),
  sets: z
    .number({ message: "Sets must be a number" })
    .int()
    .nonnegative()
    .max(100)
    .optional(),
});

export const createWorkoutScheduleSchema = z.object({
  planName: z
    .string()
    .trim()
    .max(150, { message: "Plan name is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional(),
  targetDay: z
    .string({ message: "Target day is required" })
    .trim()
    .min(1, { message: "Target day cannot be empty" })
    .max(50, { message: "Target day is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage }),
  items: z
    .array(scheduleItemSchema)
    .min(1, { message: "At least one exercise is required in the schedule" })
    .max(50, { message: "Too many exercises in a single day schedule" }),
});

export const updateWorkoutScheduleSchema = z.object({
  planName: z
    .string()
    .trim()
    .max(150, { message: "Plan name is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional(),
  targetDay: z
    .string()
    .trim()
    .max(50, { message: "Target day is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional(),
  items: z
    .array(scheduleItemSchema)
    .max(50, { message: "Too many exercises in a single day schedule" })
    .optional(),
});

export type CreateWorkoutScheduleInput = z.infer<typeof createWorkoutScheduleSchema>;
export type UpdateWorkoutScheduleInput = z.infer<typeof updateWorkoutScheduleSchema>;
