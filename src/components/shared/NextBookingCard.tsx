"use client";

import { MapPin, CalendarDays } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface NextBookingData {
  /** Short category badge — "Event" or "Facility Booking". */
  tag: string;
  /** Event or facility name. */
  name: string;
  /** Secondary line — formatted date (+ time for events). */
  info?: string;
  /** Location text for events; facility name/type for facility bookings. */
  location?: string;
  /** Pre-formatted "Today" / "Tomorrow" / "In N days" countdown label. */
  daysLabel: string;
}

export default function NextBookingCard({
  tag,
  name,
  info,
  location,
  daysLabel,
}: NextBookingData) {
  const { t } = useI18n();

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between mb-2.5">
        <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning font-semibold">
          {tag}
        </Badge>
        <span className="text-[15px] font-bold text-foreground">
          {t("nextBooking.title")}
        </span>
      </div>

      <div className="mb-2.5">
        <div className="text-base font-bold text-foreground">{name}</div>
        {info && <div className="text-xs text-foreground/70 mt-0.5">{info}</div>}
      </div>

      <div className="flex items-center justify-between gap-2">
        {location ? (
          <span className="flex items-center gap-1 text-[13px] text-foreground/70 min-w-0">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{location}</span>
          </span>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-1.5 text-primary font-bold text-[13px] shrink-0">
          <CalendarDays className="w-3.5 h-3.5" />
          {daysLabel}
        </span>
      </div>
    </Card>
  );
}
