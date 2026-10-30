import { cookies } from "next/headers"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { requireSession } from "@/features/auth/session"
import * as api from "@/features/bookings/api"
import { AppSidebar } from "@/features/shell/app-sidebar"

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSession()
  const [resources, active, health] = await Promise.all([
    api.listResources(),
    api.listBookings({ status: "active" }),
    api.health(),
  ])
  const counts = new Map<string, number>()
  for (const booking of active.ok ? active.data : []) {
    counts.set(booking.resourceId, (counts.get(booking.resourceId) ?? 0) + 1)
  }
  const sidebarResources = (resources.ok ? resources.data : []).map((id) => ({
    id,
    active: counts.get(id) ?? 0,
  }))
  // Keeps the sidebar open or collapsed across reloads (shadcn's own cookie).
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        user={session.user}
        resources={sidebarResources}
        health={health.ok ? health.data : null}
      />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-5" />
          <span className="truncate text-sm text-muted-foreground">
            Reservas sem conflito · horas inteiras no fuso local
          </span>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
