import { z } from "zod";

const noHtmlRegex = /^[^<>]*$/;
const noHtmlMessage = "HTML tags and scripts (<, >) are strictly forbidden to prevent XSS";

export const classJoinSchema = z.object({
  classId: z
    .string({ message: "Class ID is required" })
    .trim()
    .min(1, { message: "Class ID cannot be empty" })
    .max(100, { message: "Class ID is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage }),
});

export type ClassJoinInput = z.infer<typeof classJoinSchema>;
