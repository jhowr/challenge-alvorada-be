import { ServerCrash } from "lucide-react"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { describeError } from "@/features/bookings/errors"
import type { ApiError } from "@/features/bookings/types"

/** Shown when the API cannot be reached: the panel has nothing of its own to show. */
export function ApiDown({ error }: { error: ApiError }) {
  return (
    <Empty className="m-6 border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ServerCrash />
        </EmptyMedia>
        <EmptyTitle>Sem resposta da API</EmptyTitle>
        <EmptyDescription>{describeError(error)}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
          pnpm --filter @booking/api dev
        </code>
        <p className="text-xs text-muted-foreground">
          Código <span className="font-mono">{error.code}</span>. Suba a API e
          recarregue a página.
        </p>
      </EmptyContent>
    </Empty>
  )
}
