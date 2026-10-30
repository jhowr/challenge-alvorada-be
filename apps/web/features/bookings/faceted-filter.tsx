"use client"

import { PlusCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export interface FacetOption {
  value: string
  label: string
  mono?: boolean
}

/**
 * The shadcn-admin faceted filter: a dashed trigger that echoes the active
 * choice as a badge. Single choice, because GET /bookings takes one value per
 * filter; picking the active option again clears it.
 */
export function FacetedFilter({
  title,
  options,
  value,
  onChange,
}: {
  title: string
  options: FacetOption[]
  value: string
  onChange: (value: string) => void
}) {
  const selected = options.find((option) => option.value === value)

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="border-dashed" />
        }
      >
        <PlusCircle data-icon="inline-start" />
        {title}
        {selected && (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <Badge
              variant="secondary"
              className={cn(
                "rounded-sm px-1 font-normal",
                selected.mono && "font-mono"
              )}
            >
              {selected.label}
            </Badge>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>Nenhum resultado.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = option.value === value
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => onChange(isSelected ? "" : option.value)}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full border border-primary",
                        !isSelected && "opacity-40"
                      )}
                      aria-hidden
                    >
                      {isSelected && (
                        <span className="size-2 rounded-full bg-primary" />
                      )}
                    </span>
                    <span className={cn(option.mono && "font-mono")}>
                      {option.label}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selected && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => onChange("")}
                    className="justify-center"
                  >
                    Limpar filtro
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
