import { Badge } from "@/components/ui/badge"
import type { BookingStatus } from "./types"

export function StatusBadge({ status }: { status: BookingStatus }) {
  return status === "active" ? (
    <Badge className="bg-free-surface text-free">ativa</Badge>
  ) : (
    <Badge variant="secondary" className="text-muted-foreground">
      cancelada
    </Badge>
  )
}
