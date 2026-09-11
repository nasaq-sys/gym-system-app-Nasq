import { z } from "zod";

const noHtmlRegex = /^[^<>]*$/;
const noHtmlMessage = "HTML tags and scripts (<, >) are strictly forbidden to prevent XSS";

export const weightLogSchema = z.object({
  exerciseId: z
    .string({ message: "Exercise ID is required" })
    .trim()
    .min(1, { message: "Exercise ID cannot be empty" })
    .max(100, { message: "Exercise ID is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage }),
  // 500kg — above the heaviest raw deadlift ever recorded (~501kg,
  // Hafþór Björnsson). The previous 1000kg cap let obvious typos through
  // silently (reported: entering a large number "saved" with no feedback,
  // when in fact it had failed this same check all along — the client just
  // never surfaced the rejection). Kept in sync with the client-side
  // MAX_WEIGHT_KG check in workouts/page.tsx.
  weight: z
    .number({ message: "Weight must be a number" })
    .positive({ message: "Weight must be greater than 0" })
    .max(500, { message: "Weight is too high — max allowed is 500kg" }),
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
  sessionNotes: z
    .string()
    .trim()
    .max(500, { message: "Session notes cannot exceed 500 characters" })
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional(),
});

export type WeightLogInput = z.infer<typeof weightLogSchema>;
