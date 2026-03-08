/**
 * Custom dropdown matching PricePin form design (Add Food Spot category/floor + SearchBar list style).
 * Button + listbox only — no native <select>.
 */
import { useState, useRef, useEffect } from 'react';

export interface AdminDropdownOption {
  value: string;
  label: string;
}

interface AdminDropdownProps {
  value: string;
  options: AdminDropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  /** Optional: class for the wrapper (e.g. max-w-xs). */
  className?: string;
  /** When true, uses smaller trigger height and label spacing. */
  compact?: boolean;
}

export function AdminDropdown({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  label,
  id = 'admin-dropdown',
  className = '',
  compact = false,
}: AdminDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? (value || placeholder);

  return (
    <div ref={ref} className={`relative overflow-visible ${className}`}>
      {label && (
        <label id={`${id}-label`} className={`block font-medium text-gray-700 ${compact ? 'text-xs mb-1' : 'text-sm mb-1.5'}`}>
          {label}
        </label>
      )}
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={label ? `${id}-label` : undefined}
        onClick={() => setOpen((o) => !o)}
        className={
          'w-full min-h-[44px] tablet:min-h-0 rounded-lg border bg-white text-left text-gray-900 transition-colors flex items-center justify-between gap-2 appearance-none touch-manipulation ' +
          (compact ? 'px-3 py-2.5 tablet:py-2 text-sm ' : 'px-4 py-3 ') +
          (open ? 'border-[#EA000B]' : 'border-gray-200 hover:border-gray-300')
        }
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{selectedLabel}</span>
        <svg
          className={`shrink-0 text-gray-500 transition-transform ${compact ? 'h-4 w-4' : 'h-5 w-5'} ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-labelledby={label ? `${id}-label` : undefined}
          className="absolute z-[100] left-0 right-0 top-full mt-1 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {options.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={value === opt.value}
              className="cursor-pointer px-4 py-3 tablet:py-2.5 text-sm text-gray-900 hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg min-h-[44px] tablet:min-h-0 flex items-center touch-manipulation"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange(opt.value);
                  setOpen(false);
                }
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
