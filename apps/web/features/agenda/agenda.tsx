"use client"

import { CalendarDays, ChevronLeft, ChevronRight, Wand2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import {
  checkAvailabilityAction,
  loadScenarioAction,
} from "@/features/bookings/actions"
import { CancelBookingDialog } from "@/features/bookings/cancel-booking-dialog"
import type {
  ApiResult,
  Availability,
  Booking,
} from "@/features/bookings/types"
import { Page, PageHeader } from "@/features/shell/page"
import {
  addLocalDays,
  formatLongDay,
  hourToDate,
  toDayParam,
} from "@/lib/hours"
import { cn } from "@/lib/utils"
import { BookingPanel } from "./booking-panel"
import { DayGrid, type Selection } from "./day-grid"

export interface AgendaProps {
  /** `YYYY-MM-DD` of the local day shown. */
  dayParam: string
  isToday: boolean
  day: { start: number; end: number }
  resources: string[]
  bookings: Booking[]
  focusedResource?: string
  now: number
}

export function Agenda(props: AgendaProps) {
  const { day, resources, bookings, focusedResource, now } = props
  const router = useRouter()
  const [selection, setSelection] = useState<Selection>(() => ({
    resourceId: focusedResource ?? resources[0] ?? "",
    start: day.start + 9,
    end: day.start + 11,
  }))
  const [showCancelled, setShowCancelled] = useState(false)
  const [cancelling, setCancelling] = useState<Booking | null>(null)
  const { availability, checking } = useAvailability(selection, bookings)

  const conflictIds = useMemo(
    () =>
      new Set(
        availability?.ok ? availability.data.conflicts.map((b) => b.id) : []
      ),
    [availability]
  )
  const visible = showCancelled
    ? bookings
    : bookings.filter((b) => b.status === "active")
  const cancelledCount =
    bookings.length - bookings.filter((b) => b.status === "active").length
  const date = hourToDate(day.start)

  const goTo = (target: Date) => {
    const query = new URLSearchParams({ day: toDayParam(target) })
    if (focusedResource) query.set("resource", focusedResource)
    router.push(`/?${query}`)
  }

  return (
    <Page>
      <PageHeader
        title="Agenda"
        description={
          <span className="inline-block first-letter:uppercase">
            {formatLongDay(date)}
            {props.isToday && " · hoje"}
          </span>
        }
        actions={
          <>
            <DayNavigator date={date} isToday={props.isToday} onGo={goTo} />
            <ScenarioButton day={day} dayParam={props.dayParam} />
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section
          className="flex min-w-0 flex-col gap-3"
          aria-label="Grade do dia"
        >
          <DayGrid
            day={day}
            resources={resources}
            bookings={visible}
            selection={selection}
            conflictIds={conflictIds}
            focusedResource={focusedResource}
            now={now}
            onSelect={setSelection}
            onCancel={setCancelling}
          />
          <GridFooter
            showCancelled={showCancelled}
            onShowCancelled={setShowCancelled}
            cancelledCount={cancelledCount}
            empty={bookings.length === 0}
          />
        </section>
        <aside className="xl:sticky xl:top-20">
          <BookingPanel
            resources={resources}
            selection={selection}
            availability={availability}
            checking={checking}
            onChange={setSelection}
          />
        </aside>
      </div>

      <CancelBookingDialog
        booking={cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
      />
    </Page>
  )
}

/**
 * Asks the API about the selection whenever it changes, and again whenever
 * the bookings change (a create or cancel elsewhere can flip the answer).
 * Late answers for an old selection are dropped.
 */
function useAvailability(selection: Selection, bookings: Booking[]) {
  const [availability, setAvailability] =
    useState<ApiResult<Availability> | null>(null)
  const [checking, setChecking] = useState(false)
  const latest = useRef(0)

  useEffect(() => {
    if (!selection.resourceId) return
    const request = ++latest.current
    const timer = setTimeout(async () => {
      setChecking(true)
      const result = await checkAvailabilityAction(
        selection.resourceId,
        selection.start,
        selection.end
      )
      if (request !== latest.current) return
      setAvailability(result)
      setChecking(false)
    }, 120)
    return () => clearTimeout(timer)
  }, [selection.resourceId, selection.start, selection.end, bookings])

  return { availability, checking }
}

function DayNavigator({
  date,
  isToday,
  onGo,
}: {
  date: Date
  isToday: boolean
  onGo: (date: Date) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        aria-label="Dia anterior"
        onClick={() => onGo(addLocalDays(date, -1))}
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="outline"
        disabled={isToday}
        onClick={() => onGo(new Date())}
      >
        Hoje
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Próximo dia"
        onClick={() => onGo(addLocalDays(date, 1))}
      >
        <ChevronRight />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="outline" size="icon" aria-label="Escolher dia" />
          }
        >
          <CalendarDays />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date}
            onSelect={(next) => {
              if (!next) return
              setOpen(false)
              onGo(next)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function ScenarioButton({
  day,
  dayParam,
}: {
  day: { start: number }
  dayParam: string
}) {
  const [pending, startTransition] = useTransition()
  function load() {
    startTransition(async () => {
      const result = await loadScenarioAction(
        day.start,
        dayParam.slice(5).replace("-", "")
      )
      if (result.created.length) {
        toast.success(`${result.created.length} reservas criadas neste dia.`, {
          description:
            "retro foi cancelada logo em seguida: o horário está livre, o id não.",
        })
      } else {
        toast.info("O cenário deste dia já foi carregado.", {
          description: `A API recusou os ids repetidos (${result.skipped[0]?.code ?? "id_already_used"}).`,
        })
      }
    })
  }
  return (
    <Button
      variant="secondary"
      className="pressable"
      onClick={load}
      disabled={pending}
    >
      {pending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <Wand2 data-icon="inline-start" />
      )}
      Carregar cenário
    </Button>
  )
}

function GridFooter({
  showCancelled,
  onShowCancelled,
  cancelledCount,
  empty,
}: {
  showCancelled: boolean
  onShowCancelled: (value: boolean) => void
  cancelledCount: number
  empty: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-muted-foreground">
      {empty ? (
        <p>
          Nenhuma reserva neste dia. Arraste sobre as horas de um recurso, ou
          use{" "}
          <span className="font-medium text-foreground">Carregar cenário</span>{" "}
          para ver as regras em ação.
        </p>
      ) : (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Legend className="border-booking-border bg-booking">
            reserva ativa
          </Legend>
          <Legend className="border-2 border-period bg-period/10">
            período selecionado
          </Legend>
          <Legend className="border-conflict bg-conflict-surface">
            em conflito
          </Legend>
          <Legend className="border-dashed hatched">cancelada</Legend>
        </ul>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Checkbox
          id="show-cancelled"
          checked={showCancelled}
          onCheckedChange={(value) => onShowCancelled(value === true)}
        />
        <Label htmlFor="show-cancelled" className="text-xs font-normal">
          Mostrar canceladas{cancelledCount > 0 && ` (${cancelledCount})`}
        </Label>
      </div>
      <Link
        href="/bookings"
        className="underline-offset-4 hover:text-foreground hover:underline"
      >
        Ver todas as reservas
      </Link>
    </div>
  )
}

function Legend({
  className,
  children,
}: {
  className: string
  children: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        className={cn("inline-block h-3 w-5 rounded-sm border", className)}
        aria-hidden
      />
      {children}
    </li>
  )
}
