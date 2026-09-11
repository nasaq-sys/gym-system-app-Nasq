import { z } from "zod";

const noHtmlRegex = /^[^<>]*$/;
const noHtmlMessage = "HTML tags and scripts (<, >) are strictly forbidden to prevent XSS";

export const facilityBookingSchema = z.object({
  bookingId: z
    .string({ message: "Booking ID is required" })
    .trim()
    .min(1, { message: "Booking ID cannot be empty" })
    .max(100, { message: "Booking ID is too long" })
    .regex(noHtmlRegex, { message: noHtmlMessage }),
});

export type FacilityBookingInput = z.infer<typeof facilityBookingSchema>;
