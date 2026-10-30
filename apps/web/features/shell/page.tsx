import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Page heading: title, one line of context and the actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && (
          <p className="max-w-[70ch] text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  )
}

export function Page({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 md:px-6",
        className
      )}
    >
      {children}
    </div>
  )
}
