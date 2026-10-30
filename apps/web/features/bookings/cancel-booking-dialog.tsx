"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatPeriod } from "@/lib/hours"
import { cancelBookingAction } from "./actions"
import { describeError } from "./errors"
import type { Booking } from "./types"

/** Cancelling frees the hours but never the id, and the dialog says so. */
export function CancelBookingDialog({
  booking,
  onOpenChange,
}: {
  booking: Booking | null
  onOpenChange: (open: boolean) => void
}) {
  const [pending, startTransition] = useTransition()

  function confirm() {
    if (!booking) return
    startTransition(async () => {
      const result = await cancelBookingAction(booking.id)
      if (!result.ok) {
        toast.error(describeError(result.error), {
          description: result.error.code,
        })
      } else if (result.data.outcome === "already_cancelled") {
        toast.info(`${booking.id} já estava cancelada.`, {
          description: "already_cancelled · nada mudou",
        })
      } else {
        toast.success(`${booking.id} cancelada.`, {
          description:
            "O horário ficou livre; o id continua reservado para sempre.",
        })
      }
      onOpenChange(false)
    })
  }

  return (
    <AlertDialog open={booking !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Cancelar <span className="font-mono">{booking?.id}</span>?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {booking &&
              `${booking.resourceId} · ${formatPeriod(booking.start, booking.end)}. `}
            O horário volta a ficar livre, mas o id{" "}
            <span className="font-mono">{booking?.id}</span> não poderá ser
            usado de novo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Manter</AlertDialogCancel>
          <Button
            variant="destructive"
            className="pressable"
            onClick={confirm}
            disabled={pending}
          >
            {pending && <Spinner data-icon="inline-start" />}
            Cancelar reserva
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
