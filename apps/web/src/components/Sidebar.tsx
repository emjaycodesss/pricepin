/**
 * Left panel: logo, search bar, food spot detail, sticky Update Menu button, and Report an Issue (flag).
 */
import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SearchBar } from './SearchBar';
import type { FoodSpotWithCoords } from '../hooks/useFoodSpots';
import { useMenuItems } from '../hooks/useMenuItems';
import { useMenuUpdates, formatUploadedLabel } from '../hooks/useMenuUpdates';
import { usePermanentlyClosedReportCount } from '../hooks/useSpotReports';
import { groupMenuItemsByCategory, groupItemsByBaseName } from '../lib/menuDisplay';
import { GalleryLightbox, type GalleryLightboxItem } from './GalleryLightbox';
import { ReportIssueModal } from './ReportIssueModal';

interface SidebarProps {
  restaurant?: FoodSpotWithCoords | null;
  /** Called when user selects a search result or uses current location; parent flies map to (lat, lng). */
  onLocationSelect?: (lat: number, lng: number) => void;
  /** When a spot is selected, called when user clicks the back button to clear selection. */
  onBack?: () => void;
  /** Current map center for search proximity bias and for "nearby" discovery list. */
  mapCenter?: { lat: number; lng: number } | null;
  /** Food spots for Discovery (already filtered by price + category in MapHub). */
  foodSpots?: FoodSpotWithCoords[];
  /** When user taps a spot in Discovery, parent selects it and flies map to it. */
  onSpotSelect?: (spot: FoodSpotWithCoords) => void;
}

/** First storefront image URL from spot. */
function getStorefrontImageUrl(r: FoodSpotWithCoords): string | null {
  const urls = r.storefront_image_urls;
  return urls && urls.length > 0 && urls[0] ? urls[0] : null;
}

type SpotTab = 'menu' | 'gallery';

/** Squared distance (no sqrt) for relative ordering; map center and spot in same units (lat/lng). */
function distSq(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dlat = lat2 - lat1;
  const dlng = lng2 - lng1;
  return dlat * dlat + dlng * dlng;
}

export function Sidebar({ restaurant, onLocationSelect, onBack, mapCenter, foodSpots = [], onSpotSelect }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SpotTab>('menu');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const { items: menuItems, isLoading: menuLoading } = useMenuItems(restaurant?.id ?? null);
  const { updates: menuUpdates } = useMenuUpdates(restaurant?.id ?? null);
  const permanentlyClosedCount = usePermanentlyClosedReportCount(restaurant?.id ?? null);
  const showReportedClosedBadge = permanentlyClosedCount >= 3;

  /** Default to Menu tab when switching to another spot. */
  useEffect(() => {
    if (restaurant?.id) setActiveTab('menu');
  }, [restaurant?.id]);

  /** Discovery: nearby spots sorted by distance (foodSpots already filtered by price + category in MapHub). */
  const discoveryNearby = useMemo(() => {
    if (!mapCenter || foodSpots.length === 0) return [];
    const list = [...foodSpots];
    list.sort((a, b) => distSq(mapCenter.lat, mapCenter.lng, a.lat, a.lng) - distSq(mapCenter.lat, mapCenter.lng, b.lat, b.lng));
    return list.slice(0, 12);
  }, [foodSpots, mapCenter]);

  /** Gallery: storefront images + menu uploads; all use "Uploaded Month, Year" label. */
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

  return (
    <aside className="absolute top-4 left-4 right-4 z-20 flex flex-col max-h-[calc(100vh-2rem)] min-h-0 overflow-visible tablet:static tablet:top-auto tablet:left-auto tablet:right-auto tablet:z-auto tablet:w-96 tablet:max-h-full tablet:min-h-0 tablet:shrink-0 tablet:border-r tablet:border-gray-200 tablet:bg-white tablet:rounded-none tablet:shadow-none">
      {/* Logo + brand: on mobile blends with map (glass); on tablet solid card header */}
      <div className="shrink-0 mb-2 flex justify-center tablet:pt-2 tablet:px-4 tablet:pb-0">
        <a
          href="/"
          className="flex items-center gap-2 no-underline rounded-2xl bg-white/50 backdrop-blur-sm border border-white/40 py-2 px-3 tablet:bg-transparent tablet:backdrop-blur-none tablet:border-0 tablet:py-0 tablet:px-0 text-gray-700/90 tablet:text-gray-900"
          aria-label="PricePin home"
        >
          <img
            src="/pricepin_logo.png"
            alt=""
            className="h-7 w-auto object-contain opacity-90 tablet:opacity-100 tablet:h-9"
          />
          <span className="font-semibold text-sm opacity-90 tablet:opacity-100 tablet:text-lg">PricePin</span>
        </a>
      </div>

      {/* Search + locate: no wrapper on mobile; on tablet inline in panel */}
      <div className="shrink-0 flex items-center gap-2 tablet:px-4 tablet:py-1">
        {restaurant && onBack && (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-white border border-gray-200 shadow-lg tablet:shadow-none tablet:border-0 text-gray-600 hover:text-gray-900 hover:bg-gray-50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#EA000B] transition-colors"
            aria-label="Back to map"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className="flex-1 min-w-0">
          <SearchBar mapCenter={mapCenter} onLocationSelect={onLocationSelect} />
        </div>
      </div>

      {/* Food spot detail card or empty state — hidden on mobile (detail shown in BottomSheet); scrollable on desktop */}
      <div className="sidebar-detail-area hidden tablet:block flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-2">
        {restaurant ? (
          <>
          <article className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)] min-h-0">
            {/* Storefront image or placeholder */}
            <div className="aspect-[16/10] bg-gray-100 relative overflow-hidden rounded-t-2xl">
              {getStorefrontImageUrl(restaurant) ? (
                <img
                  src={getStorefrontImageUrl(restaurant)!}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>

            <div className="p-4">
              {/* Name + category only — flag moved below for clearer hierarchy */}
              <div className="flex flex-wrap items-start gap-2">
                <h2 className="font-semibold text-gray-900 text-lg leading-tight flex-1 min-w-0">
                  {restaurant.name}
                </h2>
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

              {/* Location: address + optional floor */}
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
                <p className="text-sm text-gray-600 mt-1 flex items-start gap-1.5">
                  <span className="shrink-0 mt-0.5 text-gray-400" aria-hidden>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </span>
                  <span className="min-w-0">{restaurant.floor_level}</span>
                </p>
              )}

              {/* Smart pricing: From ₱min (lowest > 0) – ₱max */}
              {restaurant.min_nonzero_meal_price != null && !Number.isNaN(Number(restaurant.min_nonzero_meal_price)) && (
                <div className="mt-3 inline-flex items-center rounded-lg bg-[#EA000B]/08 px-2.5 py-1">
                  <span className="text-sm font-medium text-gray-700">From</span>
                  <span className="text-sm font-semibold tabular-nums text-gray-900 ml-1">
                    ₱{Number(restaurant.min_nonzero_meal_price).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    {restaurant.max_meal_price != null && !Number.isNaN(Number(restaurant.max_meal_price)) && (
                      <> – ₱{Number(restaurant.max_meal_price).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</>
                    )}
                  </span>
                </div>
              )}

              {/* Report an issue: own row, right-aligned */}
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setReportModalOpen(true)}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-2 rounded-md px-1 -mr-1 transition-colors"
                  aria-label="Report an issue"
                >
                  <svg className="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                  </svg>
                  <span>Report an issue</span>
                </button>
              </div>

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
                      activeTab === 'menu'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Menu/Rates
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'gallery'}
                    onClick={() => setActiveTab('gallery')}
                    className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-2 ${
                      activeTab === 'gallery'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Gallery
                  </button>
                </div>

                {activeTab === 'menu' && (
                  <div className="mt-3" role="tabpanel" aria-label="Menu and rates">
                    {restaurant.has_menu_data === false ? (
                      <div className="rounded-xl p-4 text-center">
                        <p className="text-sm text-gray-600">
                          We don&apos;t have prices for this spot yet. Can you help?
                        </p>
                      </div>
                    ) : menuLoading ? (
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
                  </div>
                )}

                {activeTab === 'gallery' && (
                  <div className="mt-3" role="tabpanel" aria-label="Gallery">
                    {galleryItems.length === 0 ? (
                      <p className="py-6 text-center text-sm text-gray-500">No photos yet.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 pr-0.5">
                        {galleryItems.map((img, idx) => (
                          <button
                            key={`${img.url}-${idx}`}
                            type="button"
                            onClick={() => setLightboxIndex(idx)}
                            aria-label={`View photo ${idx + 1} of ${galleryItems.length}`}
                            className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200 focus:outline-none"
                          >
                            <img
                              src={img.url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </article>
          <GalleryLightbox
            items={galleryItems}
            currentIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onIndexChange={setLightboxIndex}
          />
          </>
        ) : (
          <div>
            <section aria-label="Discover nearby food spots">
              {!mapCenter || foodSpots.length === 0 ? (
                <p className="text-sm text-gray-500">Move the map or search to see spots near you.</p>
              ) : discoveryNearby.length === 0 ? (
                <p className="text-sm text-gray-500">No spots in this category nearby. Try another or move the map.</p>
              ) : (
                <>
                  <h2 className="text-sm font-semibold text-gray-900 mt-3 mb-3">Discover nearby food spots</h2>
                  <ul className="space-y-2" role="list">
                  {discoveryNearby.map((spot) => (
                    <li key={spot.id}>
                      <button
                        type="button"
                        onClick={() => onSpotSelect?.(spot)}
                        className="w-full text-left flex items-center gap-4 p-2 -m-2 rounded-xl hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#EA000B] transition-colors"
                      >
                        <div className="w-20 h-20 shrink-0 rounded-xl bg-gray-100 overflow-hidden ring-1 ring-black/5">
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
                </>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Sticky Update Menu button — always visible when a spot is selected */}
      {restaurant && (
        <div className="hidden tablet:block shrink-0 px-4 py-3 border-t border-gray-200 bg-white">
          <Link
            to={`/update-menu/${restaurant.id}`}
            className="block w-full rounded-xl bg-[#EA000B] py-3 text-center text-sm font-semibold text-white hover:bg-[#c20009] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-2"
          >
            Update Menu
          </Link>
        </div>
      )}

      {restaurant && reportModalOpen && (
        <ReportIssueModal
          foodSpotId={restaurant.id}
          foodSpotName={restaurant.name}
          onClose={() => setReportModalOpen(false)}
        />
      )}
    </aside>
  );
}
