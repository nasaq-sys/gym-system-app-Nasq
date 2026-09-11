import { z } from "zod";

const noHtmlRegex = /^[^<>]*$/;
const noHtmlMessage = "HTML tags and scripts (<, >) are strictly forbidden to prevent XSS";

export const feedbackSchema = z.object({
  message: z
    .string({ message: "Feedback message is required" })
    .trim()
    .min(1, { message: "Feedback message cannot be empty" })
    .max(2000, { message: "Feedback message cannot exceed 2000 characters" })
    .regex(noHtmlRegex, { message: noHtmlMessage }),
  type: z
    .string()
    .trim()
    .max(50, { message: "Type is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional(),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;
