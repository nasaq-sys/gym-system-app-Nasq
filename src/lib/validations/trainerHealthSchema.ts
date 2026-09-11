import { z } from "zod";

const noHtmlRegex = /^[^<>]*$/;
const noHtmlMessage = "HTML tags and scripts (<, >) are strictly forbidden to prevent XSS";

export const trainerHealthSchema = z.object({
  type: z.enum(["followup", "inbody"]).optional(),
  date: z.string().trim().max(50).regex(noHtmlRegex, { message: noHtmlMessage }).optional(),
  weight: z.string().trim().max(20).regex(noHtmlRegex, { message: noHtmlMessage }).optional(),
  bodyFat: z.string().trim().max(20).regex(noHtmlRegex, { message: noHtmlMessage }).optional(),
  waist: z.string().trim().max(20).regex(noHtmlRegex, { message: noHtmlMessage }).optional(),
  chest: z.string().trim().max(20).regex(noHtmlRegex, { message: noHtmlMessage }).optional(),
  arm: z.string().trim().max(20).regex(noHtmlRegex, { message: noHtmlMessage }).optional(),
  thigh: z.string().trim().max(20).regex(noHtmlRegex, { message: noHtmlMessage }).optional(),
  trainerNotes: z.string().trim().max(1000).regex(noHtmlRegex, { message: noHtmlMessage }).optional(),
  muscleMass: z.string().trim().max(20).regex(noHtmlRegex, { message: noHtmlMessage }).optional(),
});

export type TrainerHealthInput = z.infer<typeof trainerHealthSchema>;
