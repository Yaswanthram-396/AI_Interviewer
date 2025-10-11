import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "../lib/utils"
import { Button } from "./button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover"

export interface SearchableSelectOption {
  value: string
  label: string
  searchText?: string
  disabled?: boolean
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  emptyText?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
  loading?: boolean
  icon?: React.ReactNode
  searchable?: boolean
}

export function SearchableSelect({
  options,
  value,

  onValueChange,
  placeholder = "Select option...",
  emptyText = "No options found.",
  searchPlaceholder = "Search...",
  className,
  disabled = false,
  loading = false,
  searchable = true,
  icon,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selectedOption = options.find((option) => option.value === value);

  // Filter options based on search input
  const filteredOptions = React.useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const lower = search.trim().toLowerCase();
   

    return options.filter(
      (option) =>
        (option.label || "").toLowerCase().includes(lower) 
    );
  }, [options, search, searchable]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
    "justify-between font-normal w-full", // 👈 added here
    !value && "text-muted-foreground",
    className
  )}
          disabled={disabled || loading}
        >
          <div className="flex items-center min-w-0">
            {icon && <span className="mr-2 flex-shrink-0">{icon}</span>}
            <span className="truncate">
              {loading
                ? "Loading..."
                : selectedOption?.label || placeholder}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        <Command>
          {searchable && (
            <CommandInput
              placeholder={searchPlaceholder}
              value={search}
              onValueChange={setSearch}
            />
          )}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  disabled={option.disabled}
                  onSelect={(currentValue) => {

                
                    onValueChange(option.value);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
