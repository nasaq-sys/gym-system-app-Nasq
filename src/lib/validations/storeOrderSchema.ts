import { z } from "zod";
import { MAX_ORDER_ITEM_QTY } from "@/lib/constants";

const noHtmlRegex = /^[^<>]*$/;
const noHtmlMessage = "HTML tags and scripts (<, >) are strictly forbidden to prevent XSS";

export const storeOrderItemSchema = z.object({
  productId: z
    .string({ message: "Product ID is required" })
    .trim()
    .min(1, { message: "Product ID cannot be empty" })
    .max(100, { message: "Product ID is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage }),
  name: z
    .string()
    .trim()
    .max(150, { message: "Product name is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional(),
  price: z.number().nonnegative().optional(),
  quantity: z
    .number({ message: "Quantity must be a number" })
    .int()
    .min(1, { message: "Quantity must be at least 1" })
    .max(MAX_ORDER_ITEM_QTY, {
      message: `الحد الأقصى للطلب هو ${MAX_ORDER_ITEM_QTY} قطع من كل منتج`,
    }),
});

export const storeOrderSchema = z.object({
  items: z
    .array(storeOrderItemSchema)
    .min(1, { message: "At least one item is required in the order" })
    .max(50, { message: "Too many items in a single order" }),
  notes: z
    .string()
    .trim()
    .max(500, { message: "Notes cannot exceed 500 characters" })
    .regex(noHtmlRegex, { message: noHtmlMessage })
    .optional(),
});

export type StoreOrderInput = z.infer<typeof storeOrderSchema>;
