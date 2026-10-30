"use server"

import { refresh } from "next/cache"
import { requireSession } from "@/features/auth/session"
import * as api from "./api"
import type { ApiResult, Booking } from "./types"

export async function checkAvailabilityAction(
  resourceId: string,
  start: number,
  end: number
) {
  await requireSession()
  return api.checkAvailability(resourceId, start, end)
}

export async function createBookingAction(booking: Omit<Booking, "status">) {
  await requireSession()
  const result = await api.createBooking(booking)
  if (result.ok) refresh()
  return result
}

export async function cancelBookingAction(id: string) {
  await requireSession()
  const result = await api.cancelBooking(id)
  if (result.ok) refresh()
  return result
}

export interface ScenarioResult {
  created: string[]
  skipped: { id: string; code: string }[]
}

/**
 * Books a small scenario on the given day so every rule has something to
 * show: adjacent periods, the same hours on another resource, a booking that
 * crosses midnight, and a cancelled one whose id stays taken. Ids carry the
 * day, so loading it twice reports `id_already_used` instead of duplicating.
 */
export async function loadScenarioAction(dayStart: number, suffix: string) {
  await requireSession()
  const at = (hour: number) => dayStart + hour
  const plan: Omit<Booking, "status">[] = [
    {
      id: `standup-${suffix}`,
      resourceId: "ROOM-A",
      start: at(9),
      end: at(11),
    },
    {
      id: `review-${suffix}`,
      resourceId: "ROOM-A",
      start: at(11),
      end: at(12),
    },
    { id: `retro-${suffix}`, resourceId: "ROOM-A", start: at(14), end: at(16) },
    {
      id: `demo-${suffix}`,
      resourceId: "PROJECTOR-1",
      start: at(9),
      end: at(11),
    },
    { id: `sync-${suffix}`, resourceId: "R1", start: at(13), end: at(14) },
    {
      id: `plantao-${suffix}`,
      resourceId: "ROOM-B",
      start: at(22),
      end: at(26),
    },
  ]

  const result: ScenarioResult = { created: [], skipped: [] }
  for (const booking of plan) {
    const outcome: ApiResult<Booking> = await api.createBooking(booking)
    if (outcome.ok) result.created.push(booking.id)
    else result.skipped.push({ id: booking.id, code: outcome.error.code })
  }
  // The retro is cancelled right away: its slot is free, its id is not.
  if (result.created.includes(`retro-${suffix}`)) {
    await api.cancelBooking(`retro-${suffix}`)
  }
  refresh()
  return result
}
