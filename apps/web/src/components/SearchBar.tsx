/**
 * Search bar: address autocomplete with search icon; separate "use current location" button
 * that triggers geolocation (browser permission) when clicked.
 * Uses Lucide Locate / LocateOff (or Crosshair) for current location and denied state.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Locate, LocateOff } from 'lucide-react';
import { searchAddress, type PhotonSuggestion } from '../lib/photon';
import { useGeolocation } from '../hooks/useGeolocation';

const DEBOUNCE_MS = 300;

/** Magnifying glass icon for search. */
function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

/** Clear (X) icon for resetting search input. */
function IconClear({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

interface SearchBarProps {
  /** Called when user selects an autocomplete result or uses current location; parent should fly/pan map to (lat, lng). */
  onLocationSelect?: (lat: number, lng: number) => void;
  /** Placeholder when input is empty. Search bar is input-only; center pin address is stored separately and not shown here. */
  placeholder?: string;
  /** Current map center for proximity bias: results near this location are prioritized (e.g. Davao vs Manila). */
  mapCenter?: { lat: number; lng: number } | null;
  /** When true, hide the "Use current location" button (e.g. when Locate is in map utility stack on mobile). */
  hideLocateButton?: boolean;
}

export function SearchBar({ onLocationSelect, placeholder = 'Search a location', mapCenter, hideLocateButton = false }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PhotonSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** When true, next debounced result must not re-open the dropdown (user just selected). */
  const skipNextOpenRef = useRef(false);
  const { position: geoPosition, loading: geoLoading, error: geoError, getPosition: getGeoPosition } = useGeolocation();

  /** Debounced search: fetch suggestions with Philippines bbox and optional proximity bias from map center. */
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const lat = mapCenter?.lat;
    const lng = mapCenter?.lng;
    timeoutRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await searchAddress(query, { lat, lon: lng });
        setSuggestions(list);
        if (skipNextOpenRef.current) {
          skipNextOpenRef.current = false;
          setOpen(false);
        } else {
          setOpen(list.length > 0);
        }
      } catch {
        setError('Search failed.');
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query, mapCenter?.lat, mapCenter?.lng]);

  /** Click outside to close dropdown. */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /** Select an address: close dropdown, fly map to result, keep selected location in search bar. */
  const handleSelect = useCallback((s: PhotonSuggestion) => {
    setSuggestions([]);
    setOpen(false);
    skipNextOpenRef.current = true;
    setQuery(s.displayName);
    onLocationSelect?.(s.lat, s.lng);
    inputRef.current?.blur();
  }, [onLocationSelect]);

  /** Search-to-Action: on Enter, select first autocomplete result and fly map there (same as clicking it). */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (suggestions.length > 0) handleSelect(suggestions[0]);
    },
    [suggestions, handleSelect]
  );

  /** When geolocation succeeds, move map to user location. */
  useEffect(() => {
    if (geoPosition) onLocationSelect?.(geoPosition.lat, geoPosition.lng);
  }, [geoPosition?.lat, geoPosition?.lng, onLocationSelect]);

  return (
    <div className="flex-1 min-w-0 flex flex-col relative" ref={containerRef}>
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 min-w-0 flex items-center rounded-lg border border-gray-300 bg-white focus-within:border-[#EA000B] focus-within:ring-2 focus-within:ring-[#EA000B]/20 transition-colors duration-150 min-h-[44px]">
          {/* Search icon always visible on the left, even while typing */}
          <span className="flex items-center justify-center w-10 h-9 shrink-0 text-gray-600 rounded-l-lg pointer-events-none" aria-hidden>
            <IconSearch />
          </span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={`flex-1 min-w-0 border-0 bg-transparent px-2 py-2.5 tablet:py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-0 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden ${query ? 'rounded-none' : 'rounded-r-lg'}`}
            style={{ WebkitAppearance: 'none' }}
            aria-label="Search a location"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls="search-suggestions"
            autoComplete="off"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="flex items-center justify-center w-8 h-8 shrink-0 rounded-r-lg text-gray-600 hover:text-gray-800 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#EA000B] transition-colors"
              aria-label="Clear search"
            >
              <IconClear />
            </button>
          ) : null}
        </div>
        {!hideLocateButton && (
          <button
            type="button"
            onClick={getGeoPosition}
            disabled={geoLoading}
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-white border border-gray-200 shadow-lg tablet:shadow-none tablet:border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-800 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#EA000B] disabled:opacity-50 transition-colors"
            aria-label={geoError ? 'Location denied' : 'Use current location'}
            title="Use current location"
          >
            {geoError ? (
              <LocateOff size={20} strokeWidth={2} className="text-gray-500" />
            ) : (
              <Locate size={20} strokeWidth={2} className={geoLoading ? 'animate-pulse' : ''} />
            )}
          </button>
        )}
      </div>
      {open && (
        <ul
          id="search-suggestions"
          className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto"
          role="listbox"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.lat}-${s.lng}-${i}`}
              role="option"
              tabIndex={0}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg"
              onClick={() => handleSelect(s)}
              onKeyDown={(e) => e.key === 'Enter' && handleSelect(s)}
            >
              {s.displayName}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <span className="absolute left-0 top-full mt-1 text-xs text-red-600" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
