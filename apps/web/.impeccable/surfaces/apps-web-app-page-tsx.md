---
version: 1
slug: "apps-web-app-page-tsx"
primary_target: "apps/web/app/(panel)/page.tsx"
related_targets: ["apps/web/app/login/page.tsx","apps/web/app/(panel)/bookings/page.tsx"]
---

# Painel de reservas (apps/web)

Scope: the authenticated panel (Agenda, Reservas) and its login. Mode: Operate.

Audience and job: the challenge evaluator checks, in minutes, that availability, conflicts, cancellation and id reuse behave as the API promises. Core task: pick a resource and an hour range, see free/busy with the exact conflicting ids, book, cancel, and browse bookings by status and resource.

Constraints: hours since epoch, displayed in local time with the raw integer visible; API error codes stay visible; login lives only in Next.

## Direction contract

THESIS: The category standard (shadcn admin) executed at the craft of the user's ninebrains panel, with one product-specific move: the day drawn as a resource × hour grid where the queried period is overlaid and conflicts light up. Refuses the KPI-cards-plus-table dashboard; there are no hero metrics.

OWN-WORLD: Light paper-neutral ground, a deep ink-blue sidebar in both themes, ink primary buttons. One reserved violet belongs only to the queried period; amber owns conflict; green owns free/active; muted red only destroys. Geist for UI and headings with tight tracking; Geist Mono only for raw integers and ids. Radius 8px controls, 12px panels, hairline borders, tabular numerals.

STORY: The evaluator sees today's grid, drags or types a range, reads "Livre" or "Ocupado" with the conflicting bookings named, books it, watches the block appear, cancels it, and tries the same id again to see `id_already_used`.

FIRST VIEWPORT: Dark sidebar (Agenda, Reservas, resource list with active counts, user menu, API driver status). Header: "Agenda", day navigator, "Nova reserva". Main left: the resource × 24h grid filling the width; right: a 360px "Verificar e reservar" panel with the live availability result above the form.

FORM: canon (standing exit taken by the user: "talvez falta um shadcnui"), craft bar = ninebrains panel. seed: 1ae936e9 roll declined in favour of canon. Signature interaction: drag across free hours on a resource row to select a period, with the violet overlay following and conflicting blocks turning amber live; motion 150–200ms ease-out, none on keyboard actions.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
