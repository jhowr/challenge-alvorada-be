# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) + shadcn/ui in `apps/web`, talking to the NestJS API in `apps/api` (pnpm workspace). The Next server calls the API; the browser never sees the API URL.

## Users

Primary: the person evaluating the Alvorada technical challenge (Case 02 — conflict-free bookings). They open the panel to see, in a few minutes, that the booking rules hold: a period is free or not, a conflicting booking is refused with the exact conflicting ids, cancelling frees the slot but never the id. They are technical, read the README and the API, and compare what the UI shows with what the API returns.

## Product Purpose

A thin operational panel over the booking API: check availability of a resource over a period, create bookings, cancel them, and browse them by resource and status. Success is the evaluator trusting the rules faster than they would by reading tests or firing `requests.http` by hand.

## Positioning

The UI makes the API's guarantees visible instead of hiding them: every refusal shows the API's own error code and the conflicting bookings, and bookings are drawn on an hour timeline so the half-open `[start, end)` boundary (a meeting ending at 11:00 frees 11:00) is something you see, not something you are told.

## Operating Context

- Runs locally next to the API (`pnpm dev`), in-memory driver by default or Postgres with `DB_DRIVER=postgres`.
- Single demo login (credentials from env) gating the panel; authentication is a UI concern only, the API stays unauthenticated as documented. Deliberate: auth is outside the challenge scope and adding it to the API would touch the tested backend (see `docs/DECISIONS.md` §3).
- Resources are a fixed seeded list (no create/edit).

## Capabilities and Constraints

- Time is a 32-bit integer the API treats as unitless. The panel reads each integer as one whole hour since 1970-01-01T00:00Z, so a single integer carries day and hour (2026-11-02 09:00 UTC = 498225). Granularity is one hour; the UI never fractions it. Displayed in the viewer's local time zone, with the raw integer kept visible next to it so it can be compared with the API. Pinned by tests in `apps/api` (see `docs/DECISIONS.md` §3).
- API error codes are the vocabulary: `validation_error`, `resource_not_found`, `id_already_used`, `conflict`, `booking_not_found`, `already_cancelled`. The UI explains them in Portuguese but keeps the code visible.
- Booking ids are chosen by the caller and never reused, even after cancellation.
- `GET /bookings` has no pagination.

## Brand Commitments

None. Product copy is in Portuguese (pt-BR), code in English.

## Evidence on Hand

Demo scenario in `apps/api/scripts/demo.ts` (ROOM-A, a projector, one working day) and `apps/api/requests.http`. No users, testimonials or metrics exist; do not fabricate them.

## Product Principles

1. Show the rule, not just the result: every refusal says which rule and which bookings.
2. Faithful to the API contract: no UI-only semantics on top of the data.
3. Fast to evaluate: the core flow (check, book, conflict, cancel) fits on one screen.
4. Nothing destructive without clarity: cancelling is permanent for the id and the UI says so.
