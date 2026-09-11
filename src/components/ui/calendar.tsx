"use client"

import * as React from "react"
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
  type Locale,
} from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from "lucide-react"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  locale,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar bg-card text-foreground p-3.5 rounded-3xl [--cell-radius:12px] [--cell-size:36px] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(locale?.code, { month: "short" }),
        formatWeekdayName: (date) => {
          const arDays = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"]
          const enDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
          const isArabic = Boolean(locale?.code?.startsWith("ar"))
          return isArabic ? arDays[date.getDay()] : enDays[date.getDay()]
        },
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit select-none", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-3", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1 z-10",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "w-8 h-8 rounded-xl p-0 select-none hover:bg-muted text-foreground/80 hover:text-foreground cursor-pointer aria-disabled:opacity-30",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "w-8 h-8 rounded-xl p-0 select-none hover:bg-muted text-foreground/80 hover:text-foreground cursor-pointer aria-disabled:opacity-30",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-8 w-full items-center justify-center font-bold text-sm text-foreground",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex h-8 w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative rounded-(--cell-radius)",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute inset-0 bg-popover opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "font-bold text-sm select-none text-foreground",
          defaultClassNames.caption_label
        ),
        month_grid: cn("w-full border-collapse space-y-1 mt-1", defaultClassNames.month_grid),
        weekdays: cn("flex w-full justify-between items-center pb-1 border-b border-border/40", defaultClassNames.weekdays),
        weekday: cn(
          "w-9 h-8 flex items-center justify-center text-center text-xs font-bold text-foreground/70 select-none shrink-0",
          defaultClassNames.weekday
        ),
        week: cn("flex w-full justify-between items-center mt-1", defaultClassNames.week),
        week_number_header: cn(
          "w-9 select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-xs text-foreground/50 select-none",
          defaultClassNames.week_number
        ),
        day: cn(
          "relative w-9 h-9 p-0 flex items-center justify-center text-center select-none shrink-0",
          defaultClassNames.day
        ),
        today: cn(
          "font-black text-primary",
          defaultClassNames.today
        ),
        outside: cn(
          "text-foreground/30 opacity-40 aria-selected:opacity-100",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-foreground/20 opacity-30 cursor-not-allowed pointer-events-none",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("rtl:rotate-180 size-4", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon className={cn("rtl:rotate-180 size-4", className)} {...props} />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          )
        },
        DayButton: ({ ...props }) => (
          <CalendarDayButton locale={locale} {...props} />
        ),
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex w-9 h-9 items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  ...props
}: React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }) {
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const isSelected = modifiers.selected
  const isToday = modifiers.today
  const isOutside = modifiers.outside
  const isDisabled = modifiers.disabled

  return (
    <Button
      variant="ghost"
      size="icon"
      ref={ref}
      data-day={day.date.toLocaleDateString(locale?.code)}
      className={cn(
        "w-9 h-9 p-0 rounded-xl font-bold text-xs sm:text-[13px] flex items-center justify-center transition-all cursor-pointer",
        !isSelected && !isToday && !isDisabled && "text-foreground hover:bg-primary/15 hover:text-primary active:scale-95",
        isToday && !isSelected && "border border-primary/50 text-primary font-black bg-primary/10 shadow-xs",
        isSelected && "bg-primary text-primary-foreground font-black shadow-md hover:bg-primary hover:text-primary-foreground active:scale-95",
        isOutside && !isSelected && "text-foreground/30 opacity-40 font-normal",
        isDisabled && "opacity-25 cursor-not-allowed hover:bg-transparent text-foreground/30 pointer-events-none",
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
