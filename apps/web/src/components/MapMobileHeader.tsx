/**
 * Mobile-only header: Search bar only (logo/back + search + locate).
 * Filters live inside the bottom sheet for a clean, unobstructed map view.
 * Locate button uses compass icon (Lucide Locate), not sun/crosshair.
 */
import { Locate } from 'lucide-react';
import { SearchBar } from './SearchBar';
import type { FoodSpotWithCoords } from '../hooks/useFoodSpots';

export interface MapMobileHeaderProps {
  restaurant?: FoodSpotWithCoords | null;
  onBack?: () => void;
  mapCenter?: { lat: number; lng: number } | null;
  onLocationSelect?: (lat: number, lng: number) => void;
  onLocateClick?: () => void;
}

export function MapMobileHeader({
  restaurant,
  onBack,
  mapCenter,
  onLocationSelect,
  onLocateClick,
}: MapMobileHeaderProps) {
  return (
    <header
      className="tablet:hidden absolute top-0 left-0 right-0 z-20 flex flex-col rounded-b-2xl overflow-hidden bg-white/70 backdrop-blur-md border-b border-white/40 shadow-sm"
      aria-label="Search"
    >
      <div className="flex items-center gap-2 px-3 py-3">
        {restaurant && onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-white/80 backdrop-blur-sm border border-gray-200/80 text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#EA000B] transition-colors touch-manipulation"
            aria-label="Back to map"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        ) : (
          <a
            href="/"
            className="shrink-0 flex items-center gap-1.5 rounded-xl py-2 pr-2 text-gray-700/90 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#EA000B]"
            aria-label="PricePin home"
          >
            <img src="/pricepin_logo.png" alt="" className="h-6 w-auto object-contain opacity-90" />
            <span className="font-semibold text-sm">PricePin</span>
          </a>
        )}
        <div className="flex-1 min-w-0">
          <SearchBar
            mapCenter={mapCenter}
            onLocationSelect={onLocationSelect}
            placeholder="Search a location"
            hideLocateButton
          />
        </div>
        {onLocateClick && (
          <button
            type="button"
            onClick={onLocateClick}
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-white/80 backdrop-blur-sm border border-gray-200/80 text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#EA000B] transition-colors touch-manipulation"
            aria-label="Use my location"
            title="Use my location"
          >
            <Locate size={20} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
    </header>
  );
}
