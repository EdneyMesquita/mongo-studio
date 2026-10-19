import * as React from "react"
import { Check, ChevronDown, CornerDownLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"

export interface ComboboxOption {
  value: string
  /** Shown instead of the value. */
  label?: string
  /** Faint text at the right, e.g. a connection's host. */
  hint?: string
}

interface ComboboxProps {
  value: string
  options: ComboboxOption[]
  onChange: (value: string) => void
  "aria-label": string
  placeholder?: string
  searchPlaceholder?: string
  /** Offers what was typed as a value of its own (a name not listed yet, a pattern). */
  allowCustom?: boolean
  /** Monospace, for names. */
  mono?: boolean
  /** "inline": borderless text, for a picker inside a sentence or a card's header. */
  variant?: "default" | "inline"
  size?: "default" | "sm"
  className?: string
  /** Called when it opens, e.g. to load the options. */
  onOpen?: () => void
  /** While the options load. */
  loading?: boolean
  title?: string
}

/** Rows drawn at once; typing narrows the rest, so a list of thousands stays quick. */
const SHOWN = 100

/**
 * A searchable picker (DESIGN.md: combobox): a trigger like a select that
 * opens a filter field over the list. Matches by substring, names starting
 * with the text first; draws the first hundred.
 */
export function Combobox({
  value,
  options,
  onChange,
  placeholder = "Pick…",
  searchPlaceholder = "Search…",
  allowCustom = false,
  mono = false,
  variant = "default",
  size = "default",
  className,
  onOpen,
  loading = false,
  title,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const current = options.find((o) => o.value === value)
  const needle = search.trim().toLowerCase()
  const matches = React.useMemo(() => {
    if (!needle) return options
    const starts: ComboboxOption[] = []
    const contains: ComboboxOption[] = []
    for (const o of options) {
      const text = (o.label ?? o.value).toLowerCase()
      if (text.startsWith(needle) || o.value.toLowerCase().startsWith(needle)) starts.push(o)
      else if (text.includes(needle) || o.value.toLowerCase().includes(needle)) contains.push(o)
    }
    return [...starts, ...contains]
  }, [options, needle])
  const shown = matches.slice(0, SHOWN)
  const custom = allowCustom && search.trim() !== "" && !options.some((o) => o.value === search.trim())

  const pick = (next: string) => {
    setOpen(false)
    setSearch("")
    if (next !== value) onChange(next)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) onOpen?.()
        else setSearch("")
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={aria["aria-label"]}
          title={title ?? (current?.label ?? value) ?? undefined}
          className={cn(
            "flex min-w-0 items-center justify-between gap-1.5 text-left whitespace-nowrap text-fg outline-none",
            variant === "default" &&
              "w-full rounded-md border border-field-line bg-field px-2.5 transition-[border-color,box-shadow] duration-100 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
            variant === "default" && (size === "sm" ? "h-7 text-sm" : "h-8 text-base"),
            variant === "inline" && "h-5 rounded-sm px-1 text-fg-2 hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-ring",
            mono && "font-data",
            className
          )}
        >
          <span className={cn("min-w-0 truncate", !value && "text-fg-3")}>{current?.label ?? (value || placeholder)}</span>
          <ChevronDown className="size-3.5 shrink-0 text-fg-3" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[max(var(--radix-popover-trigger-width),260px)] max-w-[420px] p-0"
        onOpenAutoFocus={(e) => {
          // the filter field takes the focus, not the first row
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).querySelector("input")?.focus()
        }}
      >
        <Command shouldFilter={false} className="rounded-lg">
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={searchPlaceholder}
            className={cn("h-9 text-sm", mono && "font-data")}
            onKeyDown={(e) => {
              // Enter on a typed name nobody lists yet
              if (e.key === "Enter" && custom && shown.length === 0) {
                e.preventDefault()
                pick(search.trim())
              }
            }}
          />
          <CommandList className="max-h-[280px]">
            {loading && options.length === 0 ? (
              <p className="py-4 text-center text-sm text-fg-3">Loading…</p>
            ) : (
              <CommandEmpty>{custom ? "Nothing listed matches." : "No matches."}</CommandEmpty>
            )}
            {custom && (
              <CommandGroup>
                <CommandItem value={`custom:${search}`} onSelect={() => pick(search.trim())}>
                  <CornerDownLeft className="size-3.5" />
                  <span className="min-w-0 truncate">
                    Use <span className={cn("text-fg", mono && "font-data")}>{search.trim()}</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            {shown.length > 0 && (
              <CommandGroup>
                {shown.map((o) => (
                  <CommandItem key={o.value} value={o.value} onSelect={() => pick(o.value)} className="h-7 text-sm">
                    <Check className={cn("size-3.5", o.value === value ? "text-accent-text" : "opacity-0")} />
                    <span className={cn("min-w-0 flex-1 truncate", mono && "font-data")}>{o.label ?? o.value}</span>
                    {o.hint && <span className="max-w-[45%] shrink-0 truncate text-xs text-fg-3">{o.hint}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {matches.length > SHOWN && (
              <p className="border-t border-line-soft px-3 py-1.5 text-xs text-fg-3">
                {(matches.length - SHOWN).toLocaleString("en")} more - keep typing to narrow them.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
