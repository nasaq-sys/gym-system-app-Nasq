import { z } from "zod";

// Disallow HTML tags (< or >) to actively prevent Stored XSS and Database Poisoning
const noHtmlRegex = /^[^<>]*$/;
const noHtmlMessage = "HTML tags and scripts (<, >) are strictly forbidden to prevent XSS";

export const lostAndFoundSchema = z.object({
  type: z.enum(["مفقودات", "معثورات"], {
    message: "Type must be either 'مفقودات' or 'معثورات'",
  }),
  itemName: z
    .string({ message: "Item name is required" })
    .trim()
    .min(1, { message: "Item name cannot be empty" })
    .max(100, { message: "Item name cannot exceed 100 characters" })
    .regex(noHtmlRegex, { message: noHtmlMessage }),
  description: z
    .string()
    .trim()
    .max(500, { message: "Description cannot exceed 500 characters" })
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional()
    .or(z.literal("")),
  location: z
    .string()
    .trim()
    .max(100, { message: "Location cannot exceed 100 characters" })
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional()
    .or(z.literal("")),
  date: z
    .string()
    .trim()
    .max(30, { message: "Invalid date format" })
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional()
    .or(z.literal("")),
});

export type LostAndFoundInput = z.infer<typeof lostAndFoundSchema>;
