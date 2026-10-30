"use client"

import { CalendarIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { dayRange, hourToDate, startOfLocalDay } from "@/lib/hours"

const dayLabel = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
})

/**
 * Picks one whole hour as a local day plus an hour of that day. The value is
 * the API's integer; the caller shows it next to the field.
 */
export function HourPicker({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string
  value: number
  onChange: (hour: number) => void
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const date = hourToDate(value)
  const day = dayRange(date)
  const offset = value - day.start
  const items = Array.from({ length: day.end - day.start }, (_, i) => ({
    value: String(i),
    label: `${String(hourToDate(day.start + i).getHours()).padStart(2, "0")}:00`,
  }))

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              variant="outline"
              className="flex-1 justify-start font-normal"
              aria-invalid={invalid || undefined}
            />
          }
        >
          <CalendarIcon
            data-icon="inline-start"
            className="text-muted-foreground"
          />
          {dayLabel.format(date)}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={startOfLocalDay(date)}
            defaultMonth={date}
            onSelect={(next) => {
              if (!next) return
              const nextDay = dayRange(next)
              // Keep the hour of day; a shorter (DST) day clamps to its last hour.
              onChange(Math.min(nextDay.start + offset, nextDay.end - 1))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      <Select
        items={items}
        value={String(offset)}
        onValueChange={(next) =>
          next !== null && onChange(day.start + Number(next))
        }
      >
        <SelectTrigger
          className="w-24"
          aria-label="Hora"
          aria-invalid={invalid || undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
