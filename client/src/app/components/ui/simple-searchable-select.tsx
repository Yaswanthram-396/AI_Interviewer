import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { cn } from "../lib/utils"
import { Button } from "./button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover"
import { Input } from "./input"

export interface SimpleSearchableSelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SimpleSearchableSelectProps {
  options: SimpleSearchableSelectOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
  emptyText?: string
  loading?: boolean
  icon?: React.ReactNode
  searchable?: boolean
}

export function SimpleSearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  className,
  disabled = false,
  emptyText = "No options found.",
  loading = false,
  icon,
  searchable = true,
}: SimpleSearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const selectedOption = options.find((option) => option.value === value)

  // Filter options based on search
  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options
    const searchLower = search.toLowerCase()
    return options.filter((option) =>
      option.label.toLowerCase().includes(searchLower) ||
      option.value.toLowerCase().includes(searchLower)
    )
  }, [options, search])

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue)
    setOpen(false)
    setSearch("")
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setSearch("")
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "justify-between font-normal w-full",
            !value && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <span className="truncate">
            {selectedOption?.label || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[300px] p-0 z-[9999]" 
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="flex flex-col bg-white border rounded-md shadow-lg">
          {/* Search Input */}
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              autoFocus={false}
            />
          </div>
          
          {/* Options List */}
          <div className="max-h-[300px] overflow-auto">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {emptyText}
              </div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  className={cn(
                    "relative flex select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none",
                    option.disabled
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer hover:bg-accent hover:text-accent-foreground"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!option.disabled) {
                      handleSelect(option.value);
                    }
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!option.disabled) {
                      handleSelect(option.value);
                    }
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
