import { z } from "zod";

const noHtmlRegex = /^[^<>]*$/;
const noHtmlMessage = "HTML tags and scripts (<, >) are strictly forbidden to prevent XSS";

export const followupSchema = z.object({
  date: z.string().trim().max(50).regex(noHtmlRegex, { message: noHtmlMessage }).optional(),
  weight: z.union([z.string(), z.number()]).optional(),
  bodyFat: z.union([z.string(), z.number()]).optional(),
  waist: z.union([z.string(), z.number()]).optional(),
  chest: z.union([z.string(), z.number()]).optional(),
  arm: z.union([z.string(), z.number()]).optional(),
  thigh: z.union([z.string(), z.number()]).optional(),
  memberNotes: z.string().trim().max(1000).regex(noHtmlRegex, { message: noHtmlMessage }).optional(),
});

export type FollowupInput = z.infer<typeof followupSchema>;
