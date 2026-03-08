/**
 * Mobile swipe-up drawer: when no spot selected shows filters (Min/Max, Category) + "Discover nearby food spots" list;
 * when spot selected shows detail. Sticky "Add Food Spot" at very bottom with solid background.
 * List mode: draggable with collapsed/expanded snap; reports expand state for map pin visibility.
 */
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { FoodSpotWithCoords } from '../hooks/useFoodSpots';
import { useMenuItems } from '../hooks/useMenuItems';
import { useMenuUpdates, formatUploadedLabel } from '../hooks/useMenuUpdates';
import { usePermanentlyClosedReportCount } from '../hooks/useSpotReports';
import { shouldShowRatesLabel, groupMenuItemsByCategory, groupItemsByBaseName } from '../lib/menuDisplay';
import { GalleryLightbox, type GalleryLightboxItem } from './GalleryLightbox';
import { ReportIssueModal } from './ReportIssueModal';

const PRICE_INPUT_MAX = 9999;

/** Categories for discovery (match spot.category case-insensitive substring). */
const DISCOVERY_CATEGORIES = [
  'Coffee',
  'Samgyupsal',
  'Buffet',
  'Restaurant',
  'Fast Food',
  'Cafe',
  'Bakery',
  'Desserts',
] as const;

interface BottomSheetProps {
  restaurant?: FoodSpotWithCoords | null;
  onBack?: () => void;
  foodSpots?: FoodSpotWithCoords[];
  mapCenter?: { lat: number; lng: number } | null;
  onSpotSelect?: (spot: FoodSpotWithCoords) => void;
  onAddRestaurant?: (lat: number, lng: number) => void;
  /** Price + category filters (moved from header into drawer). */
  priceRange?: { min: number; max: number };
  onPriceRangeChange?: React.Dispatch<React.SetStateAction<{ min: number; max: number }>>;
  discoveryCategory?: string | null;
  onDiscoveryCategoryChange?: (category: string | null) => void;
  /** Price-filtered spots for category chip counts. */
  categoryCountSpots?: FoodSpotWithCoords[];
  /** Called when sheet snap state changes; expanded = sheet dragged up (hide center pin on map). */
  onSheetExpandChange?: (expanded: boolean) => void;
}

/** Squared distance for sorting nearby (same units lat/lng). */
function distSq(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dlat = lat2 - lat1;
  const dlng = lng2 - lng1;
  return dlat * dlat + dlng * dlng;
}

/** First storefront image URL from spot. */
function getStorefrontImageUrl(r: FoodSpotWithCoords): string | null {
  const urls = r.storefront_image_urls;
  return urls && urls.length > 0 && urls[0] ? urls[0] : null;
}

type SpotTab = 'menu' | 'gallery';

export function BottomSheet({
  restaurant,
  onBack,
  foodSpots = [],
  mapCenter,
  onSpotSelect,
  onAddRestaurant,
  priceRange = { min: 0, max: 1000 },
  onPriceRangeChange,
  discoveryCategory = null,
  onDiscoveryCategoryChange,
  categoryCountSpots = [],
  onSheetExpandChange,
}: BottomSheetProps) {
  const [activeTab, setActiveTab] = useState<SpotTab>('menu');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  /** List-mode sheet snap: collapsed (peek) vs expanded (70vh). Used for drag-to-resize and pin visibility. */
  const COLLAPSED_HEIGHT_PX = 260;
  const [expandedHeightPx, setExpandedHeightPx] = useState(() => Math.round(window.innerHeight * 0.7));
  const [sheetSnap, setSheetSnap] = useState<'collapsed' | 'expanded'>('collapsed');
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const dragStartRef = useRef<{ y: number; height: number } | null>(null);
  const lastDragHeightRef = useRef<number>(COLLAPSED_HEIGHT_PX);

  useEffect(() => {
    const update = () => setExpandedHeightPx(Math.round(window.innerHeight * 0.7));
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    onSheetExpandChange?.(sheetSnap === 'expanded');
  }, [sheetSnap, onSheetExpandChange]);

  const listSheetHeight = dragHeight ?? (sheetSnap === 'collapsed' ? COLLAPSED_HEIGHT_PX : expandedHeightPx);

  const handleListSheetTouchStart = useCallback(
    (e: React.TouchEvent) => {
      dragStartRef.current = { y: e.touches[0].clientY, height: listSheetHeight };
    },
    [listSheetHeight]
  );
  const handleListSheetTouchMove = useCallback((e: React.TouchEvent) => {
    const start = dragStartRef.current;
    if (!start) return;
    const dy = start.y - e.touches[0].clientY;
    const next = Math.max(COLLAPSED_HEIGHT_PX, Math.min(expandedHeightPx, start.height + dy));
    lastDragHeightRef.current = next;
    setDragHeight(next);
  }, [expandedHeightPx]);
  const handleListSheetTouchEnd = useCallback(() => {
    const h = lastDragHeightRef.current;
    const mid = (COLLAPSED_HEIGHT_PX + expandedHeightPx) * 0.5;
    setSheetSnap(h >= mid ? 'expanded' : 'collapsed');
    setDragHeight(null);
    dragStartRef.current = null;
  }, [expandedHeightPx]);
  const { items: menuItems, isLoading: menuLoading } = useMenuItems(restaurant?.id ?? null);
  const { updates: menuUpdates } = useMenuUpdates(restaurant?.id ?? null);
  const permanentlyClosedCount = usePermanentlyClosedReportCount(restaurant?.id ?? null);
  const showReportedClosedBadge = permanentlyClosedCount >= 3;

  /** Category options with counts (from price-filtered spots). */
  const categoriesWithCount = useMemo(() => {
    const withCount = DISCOVERY_CATEGORIES.map((label) => {
      const count = categoryCountSpots.filter((s) =>
        (s.category ?? '').toLowerCase().includes(label.toLowerCase())
      ).length;
      return { label, count };
    }).filter((x) => x.count > 0);
    return withCount.filter(
      (x) =>
        !withCount.some(
          (y) =>
            y !== x &&
            y.label.length > x.label.length &&
            y.label.toLowerCase().includes(x.label.toLowerCase())
        )
    );
  }, [categoryCountSpots]);

  const setMin = (value: number) => {
    const clamped = Math.max(0, Math.min(PRICE_INPUT_MAX, Math.round(value)));
    onPriceRangeChange?.((prev) => ({ ...prev, min: Math.min(clamped, prev.max) }));
  };
  const setMax = (value: number) => {
    const clamped = Math.max(0, Math.min(PRICE_INPUT_MAX, Math.round(value)));
    onPriceRangeChange?.((prev) => ({ ...prev, max: Math.max(clamped, prev.min) }));
  };

  /** Nearby spots for list mode (sorted by distance; already filtered in MapHub). */
  const discoveryNearby = useMemo(() => {
    if (!mapCenter || foodSpots.length === 0) return [];
    const list = [...foodSpots];
    list.sort(
      (a, b) =>
        distSq(mapCenter.lat, mapCenter.lng, a.lat, a.lng) - distSq(mapCenter.lat, mapCenter.lng, b.lat, b.lng)
    );
    return list.slice(0, 12);
  }, [foodSpots, mapCenter]);

  const galleryItems = useMemo((): GalleryLightboxItem[] => {
    const list: GalleryLightboxItem[] = [];
    const urls = restaurant?.storefront_image_urls;
    const spotCreatedAt = restaurant?.created_at ?? '';
    if (urls?.length) {
      urls.forEach((url) => {
        if (url) list.push({ url, label: formatUploadedLabel(spotCreatedAt) });
      });
    }
    menuUpdates.forEach((u) => {
      if (u.menu_photo_url) list.push({ url: u.menu_photo_url, label: formatUploadedLabel(u.uploaded_at) });
    });
    return list;
  }, [restaurant?.storefront_image_urls, restaurant?.created_at, menuUpdates]);

  /** Default to Menu tab when switching to another spot. */
  useEffect(() => {
    if (restaurant?.id) setActiveTab('menu');
  }, [restaurant?.id]);

  /** Lock body scroll when sheet is expanded (detail view) so only the sheet scrolls. */
  useEffect(() => {
    if (!restaurant) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [restaurant]);

  /* List mode: draggable sheet (collapsed/expanded snap) + filters + nearby spots + sticky Add Food Spot */
  if (!restaurant) {
    return (
      <div
        className="tablet:hidden fixed inset-x-0 bottom-0 top-auto flex min-h-0 flex-col rounded-t-2xl z-20 will-change-transform bg-white border-t border-gray-200 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]"
        style={{ height: listSheetHeight, transition: dragHeight === null ? 'height 0.25s ease-out' : 'none' }}
      >
        <div
          className="flex shrink-0 flex-col items-center pt-2.5 pb-2 rounded-t-2xl bg-white touch-none select-none"
          onTouchStart={handleListSheetTouchStart}
          onTouchMove={handleListSheetTouchMove}
          onTouchEnd={handleListSheetTouchEnd}
          role="button"
          tabIndex={0}
          aria-label={sheetSnap === 'expanded' ? 'Collapse drawer' : 'Expand drawer'}
          onKeyDown={(e) => e.key === 'Enter' && setSheetSnap((s) => (s === 'expanded' ? 'collapsed' : 'expanded'))}
        >
          <span className="w-10 h-1 rounded-full bg-gray-300" aria-hidden />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-2 bottom-sheet-scroll">
          {/* Filters: two-row layout — Row 1: price range (labels above); Row 2: category chips, aligned */}
          <section className="pt-1 pb-3 space-y-3" aria-label="Discovery filters">
            {/* Row 1: Price range — Min/Max labels above inputs, ₱ inside field; equal-width inputs aligned with chips */}
            <div className="flex items-end gap-2 w-full">
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-500">Min</span>
                <label className="flex items-center rounded-lg border border-gray-200 bg-gray-50/80 focus-within:border-[#EA000B] focus-within:ring-1 focus-within:ring-[#EA000B]/30 min-h-[40px]">
                  <span className="pl-2.5 text-gray-400 text-sm shrink-0">₱</span>
                  <input
                    type="number"
                    min={0}
                    max={PRICE_INPUT_MAX}
                    value={priceRange.min}
                    onChange={(e) => setMin(Number(e.target.value) || 0)}
                    className="flex-1 min-w-0 w-full border-0 bg-transparent py-2 pr-2.5 pl-0.5 text-sm tabular-nums text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    aria-label="Minimum price"
                  />
                </label>
              </div>
              <span className="text-gray-400 shrink-0 pb-2.5" aria-hidden>–</span>
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-500">Max</span>
                <label className="flex items-center rounded-lg border border-gray-200 bg-gray-50/80 focus-within:border-[#EA000B] focus-within:ring-1 focus-within:ring-[#EA000B]/30 min-h-[40px]">
                  <span className="pl-2.5 text-gray-400 text-sm shrink-0">₱</span>
                  <input
                    type="number"
                    min={0}
                    max={PRICE_INPUT_MAX}
                    value={priceRange.max}
                    onChange={(e) => setMax(Number(e.target.value) || 0)}
                    className="flex-1 min-w-0 w-full border-0 bg-transparent py-2 pr-2.5 pl-0.5 text-sm tabular-nums text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    aria-label="Maximum price"
                  />
                </label>
              </div>
            </div>
            {/* Row 2: Horizontal scrolling category chips — same horizontal bounds as price row */}
            <div className="flex gap-2 overflow-x-auto overflow-y-hidden scrollbar-hide w-full py-0.5">
              <button
                type="button"
                onClick={() => onDiscoveryCategoryChange?.(null)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                  discoveryCategory === null ? 'bg-[#EA000B] text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                All
              </button>
              {categoriesWithCount.map(({ label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => onDiscoveryCategoryChange?.(discoveryCategory === label ? null : label)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                    discoveryCategory === label ? 'bg-[#EA000B] text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {label.replace(/ \(.*\)$/, '')}
                </button>
              ))}
            </div>
          </section>
          {/* Dashed divider between filters and Discover nearby food spots */}
          <div className="border-t border-dashed border-gray-200/80 my-0" aria-hidden />
          <div className="pt-3 pb-2">
            <h2 className="text-sm font-semibold text-gray-900">Discover nearby food spots</h2>
          </div>
          {!mapCenter || foodSpots.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">Move the map or search to see spots near you.</p>
          ) : discoveryNearby.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No spots match your filters. Try another category or move the map.</p>
          ) : (
            <ul className="space-y-2 pb-2" role="list">
              {discoveryNearby.map((spot) => (
                <li key={spot.id}>
                  <button
                    type="button"
                    onClick={() => onSpotSelect?.(spot)}
                    className="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-white/70 hover:bg-white/90 border border-gray-200/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-2 transition-colors touch-manipulation"
                  >
                    <div className="w-16 h-16 shrink-0 rounded-xl bg-gray-100 overflow-hidden ring-1 ring-black/5">
                      {getStorefrontImageUrl(spot) ? (
                        <img src={getStorefrontImageUrl(spot)!} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 py-0.5">
                      <p className="text-sm font-medium text-gray-900 truncate leading-snug">{spot.name}</p>
                      {spot.category && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{spot.category}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-gray-400 p-1" aria-hidden>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* Sticky Add Food Spot at very bottom — solid background so it doesn't overlap map pins */}
        {onAddRestaurant && mapCenter && (
          <div className="shrink-0 px-4 py-3 border-t border-gray-200 bg-white rounded-b-2xl safe-area-pb">
            <button
              type="button"
              onClick={() => onAddRestaurant(mapCenter.lat, mapCenter.lng)}
              className="w-full min-h-[48px] rounded-xl bg-[#EA000B] text-white text-sm font-semibold hover:bg-[#c20009] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-2 touch-manipulation"
              aria-label="Add food spot at map center"
            >
              Add Food Spot
            </button>
          </div>
        )}
      </div>
    );
  }

  /* Detail mode: selected spot — semi-transparent blur */
  return (
    <div className="tablet:hidden fixed inset-x-0 bottom-0 top-auto flex max-h-[85vh] min-h-0 flex-col rounded-t-2xl z-20 will-change-transform bg-white/90 backdrop-blur-xl border-t border-white/60 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
      {/* Drag handle (centered) + Back (right) */}
      <div className="relative flex shrink-0 flex-col items-center pt-2 pb-1 px-4 rounded-t-2xl">
        <span className="w-10 h-1 rounded-full bg-gray-300/90" aria-hidden />
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="absolute right-4 top-2 flex items-center justify-center w-9 h-9 rounded-lg text-gray-600 hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] touch-manipulation"
            aria-label="Back to map"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>
      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6 bottom-sheet-scroll">
        {/* Storefront image or placeholder */}
        <div className="aspect-[16/10] rounded-xl bg-gray-100 overflow-hidden -mt-1 mb-4">
          {getStorefrontImageUrl(restaurant) ? (
            <img
              src={getStorefrontImageUrl(restaurant)!}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>
        <div className="flex items-start gap-2 flex-wrap">
          <h2 className="font-semibold text-gray-900 text-lg leading-tight flex-1 min-w-0">{restaurant.name}</h2>
          <button
            type="button"
            onClick={() => setReportModalOpen(true)}
            className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none"
            aria-label="Report an issue"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
          </button>
          {restaurant.category && (
            <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {restaurant.category}
            </span>
          )}
        </div>
        {showReportedClosedBadge && (
          <div className="mt-2 rounded-lg bg-amber-100 border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-amber-800">
            Reported Closed
          </div>
        )}
        {restaurant.address && (
          <p className="text-sm text-gray-600 mt-2 flex items-start gap-1.5">
            <span className="shrink-0 mt-0.5 text-gray-400" aria-hidden>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
            <span className="min-w-0">{restaurant.address}</span>
          </p>
        )}
        {restaurant.floor_level && (
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            <span aria-hidden>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </span>
            {restaurant.floor_level}
          </p>
        )}
        {/* Smart pricing: From ₱min (lowest > 0) – ₱max */}
        {restaurant.min_nonzero_meal_price != null && !Number.isNaN(Number(restaurant.min_nonzero_meal_price)) && (
          <div className="mt-3 inline-flex items-center rounded-lg bg-[#EA000B]/08 px-2.5 py-1.5">
            <span className="text-sm font-medium text-gray-700">From</span>
            <span className="text-sm font-semibold tabular-nums text-gray-900 ml-1">
              ₱{Number(restaurant.min_nonzero_meal_price).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              {restaurant.max_meal_price != null && !Number.isNaN(Number(restaurant.max_meal_price)) && (
                <> – ₱{Number(restaurant.max_meal_price).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</>
              )}
            </span>
          </div>
        )}

        {/* Dashed separator between upper section and tabs */}
        <hr className="mt-4 border-0 border-t border-dashed border-gray-300" />

        {/* Tabbed: Menu (default) | Gallery */}
        <div className="mt-4">
          <div className="flex rounded-xl bg-gray-100 p-1" role="tablist" aria-label="Spot content">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'menu'}
              onClick={() => setActiveTab('menu')}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-2 ${
                activeTab === 'menu' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Menu
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'gallery'}
              onClick={() => setActiveTab('gallery')}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-2 ${
                activeTab === 'gallery' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Gallery
            </button>
          </div>

          {activeTab === 'menu' && (
            <div className="mt-3" role="tabpanel" aria-label="Menu">
              {restaurant.has_menu_data === false ? (
                <div className="rounded-xl p-4 text-center">
                  <p className="text-sm text-gray-600">
                    We don&apos;t have prices for this spot yet. Can you help?
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {shouldShowRatesLabel(restaurant.category) ? 'Rates' : 'Menu'}
                    </h3>
                    {!menuLoading && menuItems.length > 0 && (
                      <span className="text-xs text-gray-400 tabular-nums">
                        {menuItems.length} {menuItems.length === 1 ? 'item' : 'items'}
                      </span>
                    )}
                  </div>
                  {menuLoading ? (
                    <p className="py-3 text-sm text-gray-500">Loading…</p>
                  ) : menuItems.length === 0 ? (
                    <p className="py-3 text-sm text-gray-500">No items yet. Add prices to help others.</p>
                  ) : (
                    <div className="space-y-3 pr-0.5">
                      {groupMenuItemsByCategory(menuItems).map((group) => (
                        <section key={group.categoryLabel} className="first:pt-0">
                          <h4 className="mb-0.5 text-xs font-medium uppercase tracking-wider text-gray-500">
                            {group.categoryLabel}
                          </h4>
                          {groupItemsByBaseName(group.items).map((baseGroup) => (
                            <div key={`${group.categoryLabel}-${baseGroup.baseName}`} className="mb-0.5 last:mb-0">
                              {baseGroup.variants.length === 1 ? (
                                <div className="flex items-baseline justify-between gap-4 py-px min-h-0">
                                  <div className="min-w-0 flex-1">
                                    <span className="text-sm font-medium text-gray-900">{baseGroup.baseName}</span>
                                    {baseGroup.variants[0].variantLabel !== '—' && (
                                      <span className="text-sm text-gray-500"> — {baseGroup.variants[0].variantLabel}</span>
                                    )}
                                  </div>
                                  <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                                    ₱{baseGroup.variants[0].price.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              ) : (
                                <>
                                  <p className="text-sm font-medium text-gray-900 mb-px leading-tight">
                                    {baseGroup.baseName}
                                  </p>
                                  <ul className="space-y-0" role="list">
                                    {baseGroup.variants.map((v) => (
                                      <li
                                        key={v.id}
                                        className="flex items-baseline gap-1 py-px min-h-0"
                                      >
                                        <span className="text-sm text-gray-600 truncate min-w-0 pl-2">
                                          {v.variantLabel}
                                        </span>
                                        <span
                                          className="flex-1 min-w-2 shrink-0 self-end border-b border-dotted border-gray-300 mb-px"
                                          style={{ minHeight: 1 }}
                                          aria-hidden
                                        />
                                        <span className="text-sm font-semibold tabular-nums text-gray-900 shrink-0">
                                          ₱{v.price.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </>
                              )}
                            </div>
                          ))}
                        </section>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'gallery' && (
            <div className="mt-3" role="tabpanel" aria-label="Gallery">
              {galleryItems.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">No photos yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {galleryItems.map((img, idx) => (
                    <button
                      key={`${img.url}-${idx}`}
                      type="button"
                      onClick={() => setLightboxIndex(idx)}
                      aria-label={`View photo ${idx + 1} of ${galleryItems.length}`}
                      className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200 focus:outline-none"
                    >
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky Update Menu button at bottom of sheet */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <Link
            to={`/update-menu/${restaurant.id}`}
            className="block w-full rounded-xl bg-[#EA000B] py-3 text-center text-sm font-semibold text-white hover:bg-[#c20009] focus:outline-none"
          >
            Update Menu
          </Link>
        </div>
      </div>
      {reportModalOpen && (
        <ReportIssueModal
          foodSpotId={restaurant.id}
          foodSpotName={restaurant.name}
          onClose={() => setReportModalOpen(false)}
        />
      )}
      <GalleryLightbox
        items={galleryItems}
        currentIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </div>
  );
}
