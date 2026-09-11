import { z } from "zod";

const noHtmlRegex = /^[^<>]*$/;
const noHtmlMessage = "HTML tags and scripts (<, >) are strictly forbidden to prevent XSS";

export const planTemplateItemSchema = z.object({
  day: z
    .string({ message: "Day is required" })
    .trim()
    .min(1)
    .max(50)
    .regex(noHtmlRegex, { message: noHtmlMessage }),
  exerciseId: z
    .string({ message: "Exercise ID is required" })
    .trim()
    .min(1)
    .max(100)
    .regex(noHtmlRegex, { message: noHtmlMessage }),
  repsSets: z
    .string()
    .trim()
    .max(100)
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional(),
});

export const createPlanTemplateSchema = z.object({
  name: z
    .string({ message: "Template name is required" })
    .trim()
    .min(1, { message: "Template name cannot be empty" })
    .max(150, { message: "Template name is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage }),
  description: z
    .string()
    .trim()
    .max(500, { message: "Description cannot exceed 500 characters" })
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional(),
  items: z.array(planTemplateItemSchema).max(100).optional(),
});

export const updatePlanTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .max(150)
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional(),
  description: z
    .string()
    .trim()
    .max(500)
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional(),
  items: z.array(planTemplateItemSchema).max(100).optional(),
});

export type CreatePlanTemplateInput = z.infer<typeof createPlanTemplateSchema>;
export type UpdatePlanTemplateInput = z.infer<typeof updatePlanTemplateSchema>;
