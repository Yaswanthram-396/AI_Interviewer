import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { cn } from "../lib/utils"
import { Button } from "./button"
import { Input } from "./input"

interface Option {
  value: string
  label: string
}

interface ModalSearchableSelectProps {
  options: Option[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  className?: string
}

export function ModalSearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  className,
}: ModalSearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const dropdownRef = React.useRef<HTMLDivElement>(null)

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

  // Handle click outside to close dropdown
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
        setSearch("")
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open])

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue)
    setOpen(false)
    setSearch("")
  }

  const toggleOpen = () => {
    setOpen(!open)
    if (!open) {
      setSearch("")
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className={cn(
          "justify-between font-normal w-full",
          !value && "text-muted-foreground",
          className
        )}
        onClick={toggleOpen}
      >
        <span className="truncate">
          {selectedOption?.label || placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {/* Dropdown Content */}
      {open && (
        <div className="absolute top-full left-0 right-0 z-[10000] mt-1 bg-white border rounded-md shadow-lg">
          {/* Search Input */}
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              autoFocus
            />
          </div>
          
          {/* Options List */}
          <div className="max-h-[200px] overflow-auto">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No options found.
              </div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  className="relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none hover:bg-gray-100 focus:bg-gray-100"
                  onClick={() => handleSelect(option.value)}
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
      )}
    </div>
  )
}
