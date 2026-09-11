import { z } from "zod";

const noHtmlRegex = /^[^<>]*$/;
const noHtmlMessage = "HTML tags and scripts (<, >) are strictly forbidden to prevent XSS";

export const createMealLogSchema = z.object({
  foodId: z
    .string({ message: "Food ID is required" })
    .trim()
    .min(1, { message: "Food ID cannot be empty" })
    .max(100, { message: "Food ID is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage }),
  name: z
    .string()
    .trim()
    .max(150, { message: "Food name is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional()
    .or(z.literal("")),
  quantityG: z
    .number({ message: "Quantity in grams must be a number" })
    .min(1, { message: "Quantity must be at least 1 gram" })
    .max(5000, { message: "Quantity cannot exceed 5000 grams" }),
});

export const updateMealLogSchema = z.object({
  quantityG: z
    .number({ message: "Quantity in grams must be a number" })
    .min(1, { message: "Quantity must be at least 1 gram" })
    .max(5000, { message: "Quantity cannot exceed 5000 grams" }),
});

export type CreateMealLogInput = z.infer<typeof createMealLogSchema>;
export type UpdateMealLogInput = z.infer<typeof updateMealLogSchema>;
