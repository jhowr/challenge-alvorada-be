"use client"

import {
  CalendarRange,
  ChevronsUpDown,
  List,
  LogOut,
  Monitor,
  Moon,
  Sun,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { logout } from "@/features/auth/actions"
import type { Health } from "@/features/bookings/types"
import { cn } from "@/lib/utils"
import { BrandMark } from "./brand-mark"
import { ResourceIcon } from "./resource-icon"

export interface SidebarResource {
  id: string
  active: number
}

const NAV = [
  { href: "/", label: "Agenda", icon: CalendarRange },
  { href: "/bookings", label: "Reservas", icon: List },
]

export function AppSidebar({
  user,
  resources,
  health,
}: {
  user: string
  resources: SidebarResource[]
  health: Health | null
}) {
  const pathname = usePathname()
  const params = useSearchParams()
  const { setOpenMobile } = useSidebar()
  const selectedResource = pathname === "/" ? params.get("resource") : null
  const day = params.get("day")
  const close = () => setOpenMobile(false)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/" onClick={close} />}
            >
              <BrandMark />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold text-sidebar-accent-foreground">
                  Reservas
                </span>
                <span className="truncate text-xs opacity-70">
                  Caso 02 · Alvorada
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Painel</SidebarGroupLabel>
          <SidebarMenu>
            {NAV.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={
                    item.href === "/"
                      ? pathname === "/" && !selectedResource
                      : pathname.startsWith(item.href)
                  }
                  tooltip={item.label}
                  render={<Link href={item.href} onClick={close} />}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Recursos</SidebarGroupLabel>
          <SidebarMenu>
            {resources.map((resource) => {
              const query = new URLSearchParams({ resource: resource.id })
              if (day) query.set("day", day)
              return (
                <SidebarMenuItem key={resource.id}>
                  <SidebarMenuButton
                    isActive={selectedResource === resource.id}
                    tooltip={resource.id}
                    render={<Link href={`/?${query}`} onClick={close} />}
                  >
                    <ResourceIcon id={resource.id} />
                    <span className="font-mono text-[13px]">{resource.id}</span>
                  </SidebarMenuButton>
                  {resource.active > 0 && (
                    <SidebarMenuBadge
                      title={`${resource.active} reservas ativas`}
                    >
                      {resource.active}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <ApiStatus health={health} />
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function ApiStatus({ health }: { health: Health | null }) {
  return (
    <div className="flex items-center gap-2 px-2 text-xs group-data-[collapsible=icon]:justify-center">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          health ? "bg-free" : "bg-destructive"
        )}
        aria-hidden
      />
      <span className="truncate group-data-[collapsible=icon]:hidden">
        {health ? (
          <>
            API no ar · driver{" "}
            <span className="font-mono">{health.driver}</span>
          </>
        ) : (
          "API fora do ar"
        )}
      </span>
    </div>
  )
}

function UserMenu({ user }: { user: string }) {
  const { isMobile } = useSidebar()
  const { theme, setTheme } = useTheme()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
                {user.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium text-sidebar-accent-foreground">
                {user}
              </span>
              <span className="truncate text-xs opacity-70">
                Sessão de demonstração
              </span>
            </div>
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={8}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>Tema</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="light">
                  <Sun />
                  Claro
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <Moon />
                  Escuro
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <Monitor />
                  Sistema
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => logout()}>
                <LogOut />
                Sair
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
