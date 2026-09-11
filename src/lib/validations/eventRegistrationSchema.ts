import { z } from "zod";

const noHtmlRegex = /^[^<>]*$/;
const noHtmlMessage = "HTML tags and scripts (<, >) are strictly forbidden to prevent XSS";

export const eventRegistrationSchema = z.object({
  eventId: z
    .string({ message: "Event ID is required" })
    .trim()
    .min(1, { message: "Event ID cannot be empty" })
    .max(100, { message: "Event ID is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage }),
});

export type EventRegistrationInput = z.infer<typeof eventRegistrationSchema>;
