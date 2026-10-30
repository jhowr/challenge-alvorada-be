import { cn } from "@/lib/utils"

/** The mark: two adjacent blocks on an hour ruler, the half-open rule in one glyph. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground",
        className
      )}
    >
      <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
        <rect x="1.5" y="6" width="8" height="8" rx="1.5" fill="currentColor" />
        <rect
          x="10.5"
          y="6"
          width="8"
          height="8"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    </span>
  )
}
