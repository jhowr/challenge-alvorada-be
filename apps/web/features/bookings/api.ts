import "server-only"

import type {
  ApiError,
  ApiResult,
  Availability,
  Booking,
  BookingStatus,
  CancelOutcome,
  Health,
} from "./types"

// Only the Next server talks to the API; the browser never sees this URL.
const API_URL = process.env.API_URL ?? "http://localhost:3000"

async function request<T>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown }
): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    })
  } catch {
    return {
      ok: false,
      status: 0,
      error: {
        code: "api_unreachable",
        message: `The booking API did not answer at ${API_URL}`,
      },
    }
  }
  const payload: unknown = await response.json().catch(() => null)
  if (response.ok) return { ok: true, data: payload as T }
  const error = isApiError(payload)
    ? payload
    : { code: "unexpected_response", message: `HTTP ${response.status}` }
  return { ok: false, status: response.status, error }
}

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ApiError).code === "string"
  )
}

export function listResources() {
  return request<string[]>("/resources")
}

export function listBookings(filter: {
  status?: BookingStatus
  resourceId?: string
}) {
  const query = new URLSearchParams()
  if (filter.status) query.set("status", filter.status)
  if (filter.resourceId) query.set("resourceId", filter.resourceId)
  const suffix = query.size ? `?${query}` : ""
  return request<Booking[]>(`/bookings${suffix}`)
}

export function checkAvailability(
  resourceId: string,
  start: number,
  end: number
) {
  const query = new URLSearchParams({ start: String(start), end: String(end) })
  return request<Availability>(
    `/resources/${encodeURIComponent(resourceId)}/availability?${query}`
  )
}

export function createBooking(booking: Omit<Booking, "status">) {
  return request<Booking>("/bookings", { method: "POST", body: booking })
}

export function cancelBooking(id: string) {
  return request<{ outcome: CancelOutcome; booking: Booking }>(
    `/bookings/${encodeURIComponent(id)}/cancellation`,
    { method: "POST" }
  )
}

export function health() {
  return request<Health>("/health")
}
