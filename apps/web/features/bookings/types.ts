/** Shapes returned by the booking API (apps/api). */

export type BookingStatus = "active" | "cancelled"

export interface Booking {
  id: string
  resourceId: string
  start: number
  end: number
  status: BookingStatus
}

export interface Availability {
  resourceId: string
  start: number
  end: number
  available: boolean
  conflicts: Booking[]
}

export type CancelOutcome = "cancelled" | "already_cancelled"

export interface Health {
  status: "ok"
  driver: "memory" | "postgres"
}

/**
 * Every API error is `{ code, message, ...details }`. `api_unreachable` is the
 * panel's own code for when the API does not answer at all.
 */
export interface ApiError {
  code: string
  message: string
  details?: { field: string; reason: string }[]
  conflictingIds?: string[]
  id?: string
  resourceId?: string
}

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; status: number; error: ApiError }
