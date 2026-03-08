/**
 * Floating filters overlay (upper-right on map): Button toggles panel with price range and category chips.
 * Updates map pins and sidebar Nearby list in real time via parent state.
 */
import { useState, useMemo, useCallback } from 'react';
import type { FoodSpotWithCoords } from '../hooks/useFoodSpots';

/** Filter/funnel icon (outline). */
function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

/** Max value allowed for min/max price inputs. */
const PRICE_INPUT_MAX = 9999;
/** Default max price when clearing filters (must match MapHub initial state). */
const DEFAULT_PRICE_MAX = 1000;

/** Quick-access categories; match against spot.category (case-insensitive substring). */
const DISCOVERY_CATEGORIES = [
  'Coffee',
  'Samgyupsal',
  'Samgyupsal / Grill',
  'Buffet',
  'Restaurant (Casual/Fine Dining)',
  'Fast Food',
  'Cafe',
  'Bakery',
  'Desserts',
] as const;

export interface MapFiltersOverlayProps {
  /** Price-filtered spots (used to compute category counts). */
  foodSpots: FoodSpotWithCoords[];
  priceRange: { min: number; max: number };
  /** Setter for price range; supports functional updates (prev => newRange) for correct behavior. */
  onPriceRangeChange: React.Dispatch<React.SetStateAction<{ min: number; max: number }>>;
  discoveryCategory: string | null;
  onDiscoveryCategoryChange: (category: string | null) => void;
}

export function MapFiltersOverlay({
  foodSpots,
  priceRange,
  onPriceRangeChange,
  discoveryCategory,
  onDiscoveryCategoryChange,
}: MapFiltersOverlayProps) {
  const [open, setOpen] = useState(false);

  /** Clamp and set min; ensure min never exceeds max. */
  const setMinPrice = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(PRICE_INPUT_MAX, Math.round(value)));
      onPriceRangeChange((prev) => ({
        ...prev,
        min: Math.min(clamped, prev.max),
      }));
    },
    [onPriceRangeChange]
  );
  /** Clamp and set max; ensure max never goes below min. */
  const setMaxPrice = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(PRICE_INPUT_MAX, Math.round(value)));
      onPriceRangeChange((prev) => ({
        ...prev,
        max: Math.max(clamped, prev.min),
      }));
    },
    [onPriceRangeChange]
  );

  /** Reset price range and category to defaults. */
  const handleClearAll = useCallback(() => {
    onPriceRangeChange({ min: 0, max: DEFAULT_PRICE_MAX });
    onDiscoveryCategoryChange(null);
  }, [onPriceRangeChange, onDiscoveryCategoryChange]);

  const discoveryCategoriesWithCount = useMemo(() => {
    const withCount = DISCOVERY_CATEGORIES.map((label) => {
      const count = foodSpots.filter((s) => (s.category ?? '').toLowerCase().includes(label.toLowerCase())).length;
      return { label, count };
    }).filter((x) => x.count > 0);
    return withCount.filter(
      (x) =>
        !withCount.some(
          (y) => y !== x && y.label.length > x.label.length && y.label.toLowerCase().includes(x.label.toLowerCase())
        )
    );
  }, [foodSpots]);

  return (
    <div className="hidden tablet:flex absolute top-4 right-4 z-10 flex-col items-end gap-0">
      {/* Toggle: show Filters button when closed, or card when open */}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2.5 rounded-xl bg-white/95 backdrop-blur-sm border border-gray-200/80 shadow-lg px-4 py-3 text-base font-medium text-black hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-2"
          aria-label="Show filters"
          aria-expanded="false"
        >
          <FilterIcon className="w-5 h-5 text-black" />
          Filters
        </button>
      ) : (
        <div
          className="w-[min(100%,400px)] rounded-2xl bg-white/95 backdrop-blur-sm border border-gray-200/80 shadow-xl p-5 space-y-5"
          aria-label="Map filters"
        >
          {/* Header: title + Clear all + close */}
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-base font-medium text-black">
              <FilterIcon className="w-5 h-5 text-black" />
              Filters
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs font-medium text-gray-500 hover:text-[#EA000B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-1 rounded px-1.5 py-1"
                aria-label="Clear all filters"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-1 min-w-[2.5rem] min-h-[2.5rem] flex items-center justify-center"
                aria-label="Close filters"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Price range: min and max inputs only (no slider) */}
          <section aria-label="Price range" className="space-y-2">
            <p className="text-sm font-semibold text-gray-500">Price range</p>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-gray-600 rounded-lg border border-gray-300 bg-white focus-within:border-[#EA000B] focus-within:ring-2 focus-within:ring-[#EA000B]/20 transition-colors duration-150">
                <span className="text-gray-500 font-medium pl-2.5">₱</span>
                <input
                  type="number"
                  min={0}
                  max={PRICE_INPUT_MAX}
                  value={priceRange.min}
                  onChange={(e) => setMinPrice(Number(e.target.value) || 0)}
                  className="w-20 border-0 bg-transparent px-2 py-2 text-sm tabular-nums focus:outline-none focus:ring-0"
                />
              </label>
              <span className="text-gray-400 text-sm">–</span>
              <label className="flex items-center gap-2 text-sm text-gray-600 rounded-lg border border-gray-300 bg-white focus-within:border-[#EA000B] focus-within:ring-2 focus-within:ring-[#EA000B]/20 transition-colors duration-150">
                <span className="text-gray-500 font-medium pl-2.5">₱</span>
                <input
                  type="number"
                  min={0}
                  max={PRICE_INPUT_MAX}
                  value={priceRange.max}
                  onChange={(e) => setMaxPrice(Number(e.target.value) || 0)}
                  className="w-20 border-0 bg-transparent px-2 py-2 text-sm tabular-nums focus:outline-none focus:ring-0"
                />
              </label>
            </div>
          </section>

          {/* Category chips — compact for density */}
          {discoveryCategoriesWithCount.length > 0 && (
            <section aria-label="Explore by category" className="space-y-1.5">
              <p className="text-sm font-semibold text-gray-500">Category</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onDiscoveryCategoryChange(null)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-1 ${
                    discoveryCategory === null ? 'bg-[#EA000B] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
                {discoveryCategoriesWithCount.map(({ label }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onDiscoveryCategoryChange(discoveryCategory === label ? null : label)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-1 ${
                      discoveryCategory === label ? 'bg-[#EA000B] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label.replace(/ \(.*\)$/, '')}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
