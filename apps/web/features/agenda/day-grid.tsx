"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useRef, useState, type PointerEvent } from "react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { StatusBadge } from "@/features/bookings/status-badge"
import type { Booking } from "@/features/bookings/types"
import { ResourceIcon } from "@/features/shell/resource-icon"
import { formatPeriod, formatRaw, formatTime } from "@/lib/hours"
import { cn } from "@/lib/utils"
import { dragSpan, hourAt, placeOnDay, type Span } from "./grid"

export interface Selection extends Span {
  resourceId: string
}

interface DayGridProps {
  day: Span
  resources: string[]
  bookings: Booking[]
  selection: Selection
  conflictIds: Set<string>
  focusedResource?: string
  now: number
  onSelect: (selection: Selection) => void
  onCancel: (booking: Booking) => void
}

/**
 * The day as a resource × hour grid. Dragging across a row selects a period
 * (violet); bookings the API reports as conflicting with it turn amber.
 */
export function DayGrid(props: DayGridProps) {
  const { day, resources, bookings, now } = props
  const hours = Array.from(
    { length: day.end - day.start },
    (_, i) => day.start + i
  )
  const nowPlacement =
    now >= day.start && now < day.end
      ? placeOnDay({ start: now, end: now + 1 }, day)
      : null

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <div className="min-w-[680px]">
        <div className="grid grid-cols-[136px_1fr] border-b">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
            Recurso
          </div>
          <div className="relative flex">
            {hours.map((hour) => (
              <div
                key={hour}
                className="flex-1 border-l py-2 text-center text-[11px] text-muted-foreground tabular-nums"
              >
                {formatTime(hour).slice(0, 2)}
              </div>
            ))}
          </div>
        </div>
        {resources.map((resourceId) => (
          <ResourceRow
            key={resourceId}
            {...props}
            hours={hours}
            resourceId={resourceId}
            bookings={bookings.filter((b) => b.resourceId === resourceId)}
            nowLeft={nowPlacement?.left}
          />
        ))}
      </div>
    </div>
  )
}

function ResourceRow({
  resourceId,
  hours,
  day,
  bookings,
  selection,
  conflictIds,
  focusedResource,
  nowLeft,
  onSelect,
  onCancel,
}: DayGridProps & { resourceId: string; hours: number[]; nowLeft?: number }) {
  const track = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{
    anchor: number
    current: number
    /** Started on a booking: a click there opens the booking, a drag selects. */
    onBooking: boolean
  } | null>(null)

  const hourFromEvent = (event: PointerEvent) => {
    const rect = track.current!.getBoundingClientRect()
    return hourAt(event.clientX - rect.left, rect.width, day)
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    // React bubbles events from portals too: a click inside a booking's
    // popover reaches this row, but is not on the track.
    if (!event.currentTarget.contains(event.target as Node)) return
    const onBooking = Boolean(
      (event.target as HTMLElement).closest("[data-booking]")
    )
    // Capturing now would swallow the click that opens the booking's popover.
    if (!onBooking) event.currentTarget.setPointerCapture(event.pointerId)
    const hour = hourFromEvent(event)
    setDrag({ anchor: hour, current: hour, onBooking })
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag) return
    const hour = hourFromEvent(event)
    if (hour === drag.current) return
    if (
      drag.onBooking &&
      !event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    setDrag({ ...drag, current: hour })
  }

  function onPointerUp() {
    if (!drag) return
    const clickedBooking = drag.onBooking && drag.anchor === drag.current
    if (!clickedBooking)
      onSelect({ resourceId, ...dragSpan(drag.anchor, drag.current) })
    setDrag(null)
  }

  const shown: Span | null =
    drag && !(drag.onBooking && drag.anchor === drag.current)
      ? dragSpan(drag.anchor, drag.current)
      : selection.resourceId === resourceId
        ? selection
        : null
  const selected = shown ? placeOnDay(shown, day) : null

  return (
    <div
      className={cn(
        "grid grid-cols-[136px_1fr] border-b last:border-b-0",
        focusedResource === resourceId && "bg-muted/40"
      )}
    >
      <div className="flex min-w-0 items-center gap-2 px-3 py-3">
        <ResourceIcon
          id={resourceId}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="truncate font-mono text-[13px] font-medium">
          {resourceId}
        </span>
      </div>
      <div
        ref={track}
        role="group"
        aria-label={`Horas de ${resourceId}. Arraste para selecionar um período.`}
        className="relative h-14 cursor-crosshair touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="absolute inset-0 flex" aria-hidden>
          {hours.map((hour) => (
            <div
              key={hour}
              className="flex-1 border-l transition-colors duration-150 hover:bg-muted/60"
            />
          ))}
        </div>
        {nowLeft !== undefined && (
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-foreground/35"
            style={{ left: `${nowLeft}%` }}
            aria-hidden
          />
        )}
        {bookings.map((booking) => (
          <BookingBlock
            key={booking.id}
            booking={booking}
            day={day}
            conflicting={conflictIds.has(booking.id)}
            onCancel={onCancel}
          />
        ))}
        {selected && shown && (
          <div
            className="pointer-events-none absolute inset-y-1 rounded-md border-2 border-period bg-period/10 transition-[left,width] duration-150 ease-(--ease-out)"
            style={{ left: `${selected.left}%`, width: `${selected.width}%` }}
          >
            <span className="absolute -top-px left-1 rounded-b-sm bg-period px-1 text-[10px] leading-4 font-medium text-period-foreground tabular-nums">
              {formatTime(shown.start).slice(0, 2)}–
              {formatTime(shown.end).slice(0, 2)}h
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function BookingBlock({
  booking,
  day,
  conflicting,
  onCancel,
}: {
  booking: Booking
  day: Span
  conflicting: boolean
  onCancel: (booking: Booking) => void
}) {
  const placement = placeOnDay(booking, day)
  if (!placement) return null
  const cancelled = booking.status === "cancelled"

  return (
    <Popover>
      <BookingTrigger
        booking={booking}
        conflicting={conflicting}
        cancelled={cancelled}
        style={{ left: `${placement.left}%`, width: `${placement.width}%` }}
        continuesBefore={placement.continuesBefore}
        continuesAfter={placement.continuesAfter}
      />
      <PopoverContent align="start" className="w-80">
        <PopoverHeader>
          <PopoverTitle className="font-mono">{booking.id}</PopoverTitle>
          <PopoverDescription>
            {booking.resourceId} · {formatPeriod(booking.start, booking.end)}
          </PopoverDescription>
        </PopoverHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Inteiros</dt>
          <dd className="font-mono">{formatRaw(booking.start, booking.end)}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <StatusBadge status={booking.status} />
          </dd>
        </dl>
        {!cancelled && (
          <>
            <Separator />
            <Button
              variant="destructive"
              size="sm"
              className="pressable"
              onClick={() => onCancel(booking)}
            >
              Cancelar reserva
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

function BookingTrigger({
  booking,
  conflicting,
  cancelled,
  style,
  continuesBefore,
  continuesAfter,
}: {
  booking: Booking
  conflicting: boolean
  cancelled: boolean
  style: React.CSSProperties
  continuesBefore: boolean
  continuesAfter: boolean
}) {
  return (
    <PopoverTrigger
      data-booking={booking.id}
      title={`${booking.id} · ${formatPeriod(booking.start, booking.end)}`}
      aria-label={`${booking.id}, ${formatPeriod(booking.start, booking.end)}${cancelled ? ", cancelada" : ""}${conflicting ? ", em conflito com o período selecionado" : ""}`}
      style={style}
      className={cn(
        "absolute inset-y-2 flex items-center gap-0.5 overflow-hidden rounded-md border px-1 text-left text-[11px] font-medium transition-[background-color,border-color,color,box-shadow] duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        cancelled &&
          "border-dashed border-border hatched text-muted-foreground line-through",
        !cancelled &&
          !conflicting &&
          "border-booking-border bg-booking text-booking-foreground hover:border-booking-foreground/40",
        !cancelled &&
          conflicting &&
          "z-10 border-conflict bg-conflict-surface text-conflict shadow-[0_1px_6px_-2px] shadow-conflict/40",
        continuesBefore && "rounded-l-none border-l-0",
        continuesAfter && "rounded-r-none border-r-0"
      )}
    >
      {continuesBefore && (
        <ChevronLeft className="size-3 shrink-0" aria-hidden />
      )}
      <span className="truncate font-mono">{booking.id}</span>
      {continuesAfter && (
        <ChevronRight className="ml-auto size-3 shrink-0" aria-hidden />
      )}
    </PopoverTrigger>
  )
}
