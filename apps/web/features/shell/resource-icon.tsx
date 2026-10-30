import { DoorOpen, Projector } from "lucide-react"

/** Rooms and equipment are told apart by name only: the API has no resource type. */
export function ResourceIcon({
  id,
  className,
}: {
  id: string
  className?: string
}) {
  return id.startsWith("PROJECTOR") ? (
    <Projector className={className} aria-hidden />
  ) : (
    <DoorOpen className={className} aria-hidden />
  )
}
