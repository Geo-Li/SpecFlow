"use client";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { ChevronDownIcon, CheckIcon } from "@heroicons/react/20/solid";

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled = false,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const selected = options.find((o) => o.value === value);

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-text-primary mb-1">
          {label}
        </label>
      )}
      <Listbox value={value} onChange={onChange} disabled={disabled}>
        <ListboxButton className="relative block w-full rounded-lg border border-border bg-white/60 py-2 pl-3 pr-8 text-left text-sm text-text-primary transition hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed">
          <span className={`block truncate ${selected ? "" : "text-text-secondary"}`}>
            {selected?.label || placeholder}
          </span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
            <ChevronDownIcon className="size-4 text-text-secondary" aria-hidden="true" />
          </span>
        </ListboxButton>

        <ListboxOptions
          anchor="bottom"
          transition
          className="z-50 mt-1 w-(--button-width) rounded-xl border border-border bg-white p-1 text-sm shadow-lg focus:outline-none origin-top transition duration-150 ease-out data-closed:scale-95 data-closed:opacity-0"
        >
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className="group flex cursor-default select-none items-center gap-2 rounded-lg py-2 px-3 text-text-primary data-focus:bg-accent/5"
            >
              <CheckIcon className="size-4 text-accent invisible group-data-selected:visible" aria-hidden="true" />
              <span className="block truncate group-data-selected:font-medium">
                {option.label}
              </span>
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </div>
  );
}
