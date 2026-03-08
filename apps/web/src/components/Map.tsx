/**
 * Full-screen Mapbox GL JS map (react-map-gl). Vector tiles, Markers, Popup, center pin overlay.
 * Clustering: spots within ~100m (e.g. inside a mall) → one node with count; click opens Location Directory list.
 * Token from VITE_MAPBOX_ACCESS_TOKEN (apps/web/.env) or __MAPBOX_ACCESS_TOKEN__ (vite define).
 * Note: events.mapbox.com may be blocked by ad blockers (ERR_BLOCKED_BY_CLIENT); the map still works.
 * @see https://docs.mapbox.com/mapbox-gl-js/
 * @see https://visgl.github.io/react-map-gl/
 */
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxMap, { Marker, Popup, MapProvider } from 'react-map-gl';
import type { MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { FoodSpotWithCoords } from '../hooks/useFoodSpots';
import { groupFoodSpotsByCoords, type ClusterGroup } from '../lib/clusterUtils';
import { logger } from '../lib/logger';
import { CenterPinOverlay } from './CenterPinOverlay';

/** Injected by Vite define from apps/web/.env */
declare const __MAPBOX_ACCESS_TOKEN__: string;

const MAP_ID = 'main';

/** First storefront image URL for popup card; null if none. */
function getStorefrontImageUrl(spot: FoodSpotWithCoords): string | null {
  const urls = spot.storefront_image_urls;
  return urls && urls.length > 0 && urls[0] ? urls[0] : null;
}

/** Price range string: "₱min – ₱max". When actual min is 0, use smallest non-zero as display min so there is always a min. */
function formatPriceRange(
  min: number | null | undefined,
  max: number | null | undefined,
  minNonZero: number | null | undefined
): string | null {
  const minNum = min != null ? Number(min) : null;
  const maxNum = max != null ? Number(max) : null;
  if (maxNum == null || Number.isNaN(maxNum)) return null;
  const fmt = (n: number) =>
    `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const displayMin =
    minNum != null && !Number.isNaN(minNum) && minNum === 0 && minNonZero != null && !Number.isNaN(Number(minNonZero))
      ? Number(minNonZero)
      : minNum;
  if (displayMin == null || Number.isNaN(displayMin)) return null;
  return `${fmt(displayMin)} – ${fmt(maxNum)}`;
}

function getMapboxToken(): string {
  const fromDefine = typeof __MAPBOX_ACCESS_TOKEN__ !== 'undefined' ? __MAPBOX_ACCESS_TOKEN__ : '';
  const fromEnv =
    typeof import.meta.env?.VITE_MAPBOX_ACCESS_TOKEN === 'string'
      ? import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
      : '';
  const token = (fromDefine || fromEnv || '').trim();
  if (import.meta.env.DEV && !token) {
    logger.warn(
      'No Mapbox token. Add VITE_MAPBOX_ACCESS_TOKEN to apps/web/.env and restart. Map may not load.'
    );
  }
  return token;
}

/** Default: Davao City. */
export const DEFAULT_CENTER: [number, number] = [7.0731, 125.6128];
export const DEFAULT_ZOOM = 13;

/** Dot marker: brand red inner circle when spot has menu data. */
const MARKER_RED = '#EA000B';
/** Pending (no menu): grey, opacity 0.6. */
const MARKER_PENDING = '#6b7280';

interface MapProps {
  center: [number, number];
  zoom: number;
  foodSpots: FoodSpotWithCoords[];
  onMarkerClick?: (spot: FoodSpotWithCoords) => void;
  onAddRestaurant?: (lat: number, lng: number) => void;
  onMapIdle?: (lat: number, lng: number) => void;
  /** When true, a spot is selected (sidebar or bottom sheet); hide center pin and map popups to avoid clash. */
  spotSelected?: boolean;
  /** Bottom padding in px (e.g. for mobile bottom sheet) so the map center stays in the visible area above the sheet. */
  paddingBottom?: number;
  /** When true, mobile bottom sheet is expanded (dragged up); fade out center pin and Add Food Spot to avoid clash. */
  sheetExpanded?: boolean;
}

export function Map({
  center,
  zoom,
  foodSpots,
  onMarkerClick,
  onAddRestaurant,
  onMapIdle,
  spotSelected = false,
  paddingBottom = 0,
  sheetExpanded = false,
}: MapProps) {
  const mapRef = useRef<MapRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** Store raw Mapbox map instance for resize() calls (e.g. after navigation when container gets correct size). */
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
  /** Single-spot popup: shown on hover only, not on click. */
  const [hoveredSpot, setHoveredSpot] = useState<FoodSpotWithCoords | null>(null);
  /** Timeout to hide popup after marker leave; cleared when mouse enters popup so user can reach the button. */
  const popupLeaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When set, this cluster is expanded: show Location Directory popup only. */
  const [expandedClusterKey, setExpandedClusterKey] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const token = getMapboxToken();

  /** Group by proximity (mall/building) so we render single pins vs one numbered node + directory. */
  const clusterGroups = useMemo(() => groupFoodSpotsByCoords(foodSpots), [foodSpots]);
  const expandedGroup = useMemo(
    () => (expandedClusterKey ? clusterGroups.find((g) => g.key === expandedClusterKey) ?? null : null),
    [expandedClusterKey, clusterGroups]
  );

  /** Clear popup leave timeout on unmount. */
  useEffect(() => () => {
    if (popupLeaveTimeoutRef.current) {
      clearTimeout(popupLeaveTimeoutRef.current);
      popupLeaveTimeoutRef.current = null;
    }
  }, []);

  /** Apply padding so center pin stays in visible area above bottom sheet (mobile). */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setPadding({ left: 0, top: 0, right: 0, bottom: paddingBottom });
  }, [paddingBottom, mapLoaded]);

  /** When parent updates center/zoom (search, GPS), fly map to new view. */
  useEffect(() => {
    const ref = mapRef.current;
    if (!ref?.flyTo) return;
    ref.flyTo({
      center: [center[1], center[0]],
      zoom,
      duration: 500,
    });
  }, [center, zoom]);

  /** When container size changes (e.g. after navigating back from Update Menu), resize map so it fills correctly. */
  useEffect(() => {
    const container = containerRef.current;
    const map = mapInstanceRef.current;
    if (!container || !map) return;

    const resize = () => {
      map.resize();
    };

    const ro = new ResizeObserver(() => {
      resize();
    });
    ro.observe(container);
    /** Initial resize in case container was wrong at first paint (e.g. after route change). */
    resize();
    return () => ro.disconnect();
  }, [mapLoaded]);

  const handleMoveEnd = useCallback(
    (evt: { viewState?: { longitude?: number; latitude?: number } }) => {
      const lng = evt.viewState?.longitude;
      const lat = evt.viewState?.latitude;
      if (typeof lng === 'number' && typeof lat === 'number') {
        onMapIdle?.(lat, lng);
      }
    },
    [onMapIdle]
  );

  const handleMarkerClick = useCallback(
    (r: FoodSpotWithCoords) => {
      setHoveredSpot(null);
      setExpandedClusterKey(null);
      mapInstanceRef.current?.flyTo({
        center: [r.lng, r.lat],
        zoom: 15,
        duration: 400,
      });
      onMarkerClick?.(r);
    },
    [onMarkerClick]
  );

  const handleClusterClick = useCallback((group: ClusterGroup) => {
    setHoveredSpot(null);
    setExpandedClusterKey(group.key);
    mapInstanceRef.current?.flyTo({
      center: [group.lng, group.lat],
      zoom: 15,
      duration: 400,
    });
  }, []);

  const handleDirectorySelect = useCallback(
    (r: FoodSpotWithCoords) => {
      setExpandedClusterKey(null);
      onMarkerClick?.(r);
    },
    [onMarkerClick]
  );

  const handleZoomIn = useCallback(() => {
    mapInstanceRef.current?.zoomIn({ duration: 200 });
  }, []);
  const handleZoomOut = useCallback(() => {
    mapInstanceRef.current?.zoomOut({ duration: 200 });
  }, []);

  const attributionAddedRef = useRef(false);
  /** On load: store map for resize(), add attribution, then resize after layout so map fills container (fixes truncation after navigation). */
  const handleMapLoad = useCallback((evt: { target: mapboxgl.Map }) => {
    const map = evt.target;
    if (!map) return;
    mapInstanceRef.current = map;
    if (!attributionAddedRef.current) {
      map.addControl(new mapboxgl.AttributionControl(), 'bottom-right');
      attributionAddedRef.current = true;
    }
    if (paddingBottom > 0) map.setPadding({ left: 0, top: 0, right: 0, bottom: paddingBottom });
    setMapLoaded(true);
    /** Resize after layout has settled (e.g. when returning from another route so container has correct dimensions). */
    const scheduleResize = () => {
      requestAnimationFrame(() => {
        map.resize();
      });
    };
    scheduleResize();
    requestAnimationFrame(scheduleResize);
  }, [paddingBottom]);

  /** No token: render placeholder so we don't break the layout. */
  if (!token) {
    return (
      <div
        className="w-full h-full min-h-[300px] flex items-center justify-center bg-gray-200 text-gray-600"
        data-testid="map-container"
      >
        <p className="text-sm">Add VITE_MAPBOX_ACCESS_TOKEN to apps/web/.env</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full min-h-[300px] relative" data-testid="map-container">
      <MapProvider>
        <MapboxMap
          id={MAP_ID}
          ref={mapRef}
          mapboxAccessToken={token}
          initialViewState={{
            longitude: center[1],
            latitude: center[0],
            zoom,
          }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          style={{ width: '100%', height: '100%' }}
          onMoveEnd={handleMoveEnd}
          onLoad={handleMapLoad}
          attributionControl={false}
        >
          {/* Single spot: dot (white circle + red inner). Popup on hover only; click selects for sidebar. */}
          {clusterGroups.map((group) =>
            group.spots.length === 1 ? (
              <Marker
                key={group.spots[0].id}
                longitude={group.spots[0].lng}
                latitude={group.spots[0].lat}
                anchor="center"
                onClick={() => handleMarkerClick(group.spots[0])}
                style={{ cursor: 'pointer' }}
              >
                <div
                  className="flex items-center justify-center w-6 h-6 rounded-full bg-white shadow-md"
                  style={{ opacity: group.spots[0].has_menu_data !== false ? 1 : 0.6 }}
                  aria-hidden
                  onMouseEnter={() => {
                    if (popupLeaveTimeoutRef.current) {
                      clearTimeout(popupLeaveTimeoutRef.current);
                      popupLeaveTimeoutRef.current = null;
                    }
                    setHoveredSpot(group.spots[0]);
                  }}
                  onMouseLeave={() => {
                    popupLeaveTimeoutRef.current = setTimeout(() => {
                      setHoveredSpot(null);
                      popupLeaveTimeoutRef.current = null;
                    }, 200);
                  }}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: group.spots[0].has_menu_data !== false ? MARKER_RED : MARKER_PENDING,
                    }}
                  />
                </div>
              </Marker>
            ) : (
              <Marker
                key={group.key}
                longitude={group.lng}
                latitude={group.lat}
                anchor="center"
                onClick={() => handleClusterClick(group)}
                style={{ cursor: 'pointer' }}
              >
                <div
                  className="flex items-center justify-center w-7 h-7 rounded-full bg-white shadow-md border-2 border-[#EA000B]"
                  aria-hidden
                  title={`${group.spots.length} spots`}
                >
                  <span className="text-xs font-semibold text-[#EA000B]">
                    {group.spots.length}
                  </span>
                </div>
              </Marker>
            )
          )}
          {/* Single-spot popup: hover only. Design-system card — rounded-2xl, brand red, clear hierarchy. */}
          {hoveredSpot && !expandedGroup && (
            <Popup
              longitude={hoveredSpot.lng}
              latitude={hoveredSpot.lat}
              anchor="bottom"
              offset={[0, -20]}
              onClose={() => setHoveredSpot(null)}
              closeButton={false}
              closeOnClick={false}
            >
              <div
                className="font-sans w-[216px] rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.1)] pointer-events-auto"
                role="dialog"
                aria-label={`Details for ${hoveredSpot.name}`}
                onMouseEnter={() => {
                  if (popupLeaveTimeoutRef.current) {
                    clearTimeout(popupLeaveTimeoutRef.current);
                    popupLeaveTimeoutRef.current = null;
                  }
                }}
                onMouseLeave={() => setHoveredSpot(null)}
              >
                {/* Hero image — same aspect as design system (16/10 used elsewhere); compact 2/1 here */}
                <div className="relative aspect-[2/1] w-full bg-gray-100">
                  {getStorefrontImageUrl(hoveredSpot) ? (
                    <img
                      src={getStorefrontImageUrl(hoveredSpot)!}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-300" aria-hidden>
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.25}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Content: design-system spacing (p-3), hierarchy, brand #EA000B for price + CTA */}
                <div className="p-3">
                  <h3 className="font-semibold text-gray-900 text-[15px] leading-snug truncate">
                    {hoveredSpot.name}
                  </h3>
                  {hoveredSpot.category && (
                    <p className="mt-1 text-xs text-gray-500">
                      {hoveredSpot.category}
                    </p>
                  )}
                  {formatPriceRange(hoveredSpot.starting_meal_price, hoveredSpot.max_meal_price, hoveredSpot.min_nonzero_meal_price) != null && (
                    <p className="mt-0 text-xs text-gray-600">
                      <span className="text-gray-500">Price range: </span>
                      <span className="text-[#000000] font-semibold">
                        {formatPriceRange(hoveredSpot.starting_meal_price, hoveredSpot.max_meal_price, hoveredSpot.min_nonzero_meal_price)}
                      </span>
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onMarkerClick?.(hoveredSpot);
                      setHoveredSpot(null);
                    }}
                    className="mt-3 w-full text-center rounded-xl bg-[#EA000B] text-white text-sm font-medium py-2.5 hover:bg-[#c20009] focus:outline-none transition-colors"
                  >
                    {hoveredSpot.has_menu_data !== false ? 'View menu' : 'Add Menu'}
                  </button>
                </div>
              </div>
            </Popup>
          )}
          {/* Location Directory popup: list of store name + starting price at this coordinate. */}
          {expandedGroup && expandedGroup.spots.length > 1 && !spotSelected && (
            <Popup
              longitude={expandedGroup.lng}
              latitude={expandedGroup.lat}
              anchor="bottom"
              offset={[0, -24]}
              onClose={() => setExpandedClusterKey(null)}
              closeButton={false}
              closeOnClick={false}
            >
              <div className="font-sans min-w-[240px] max-w-[320px] rounded-2xl overflow-hidden border border-gray-200 shadow-xl bg-white">
                <div className="bg-[#EA000B] px-4 py-3 border-b border-[#c20009] relative pr-10">
                  <p className="text-white font-semibold text-sm uppercase tracking-wider">
                    Location directory
                  </p>
                  <p className="text-white/90 text-xs mt-0.5">
                    {expandedGroup.spots.length} food spot{expandedGroup.spots.length !== 1 ? 's' : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => setExpandedClusterKey(null)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white hover:text-white focus:outline-none rounded"
                    aria-label="Close"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                  {expandedGroup.spots.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => handleDirectorySelect(r)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 transition-colors"
                      >
                        <span className="font-medium text-gray-900 block truncate pr-2">
                          {r.name}
                        </span>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {r.min_nonzero_meal_price != null ? (
                            <span className="text-sm font-medium text-[#EA000B]">
                              From ₱{Number(r.min_nonzero_meal_price).toFixed(0)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">No menu</span>
                          )}
                          {r.floor_level && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                              {r.floor_level}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </Popup>
          )}
        </MapboxMap>
        <CenterPinOverlay
          mapId={MAP_ID}
          onAddRestaurant={onAddRestaurant}
          visible={!hoveredSpot && !expandedClusterKey && !spotSelected && !sheetExpanded}
        />
        {/* Utility stack: Zoom + Locate (right side); semi-transparent blur so map feels larger */}
        <div
          className="absolute bottom-12 right-3 flex flex-col rounded-xl overflow-hidden bg-white/75 backdrop-blur-md border border-white/60 shadow-lg"
          role="group"
          aria-label="Map controls"
        >
          <button
            type="button"
            onClick={handleZoomIn}
            className="flex items-center justify-center w-11 h-11 text-gray-700 hover:bg-white/60 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#EA000B] transition-colors touch-manipulation"
            aria-label="Zoom in"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <span className="block w-full h-px bg-gray-200/80" aria-hidden />
          <button
            type="button"
            onClick={handleZoomOut}
            className="flex items-center justify-center w-11 h-11 text-gray-700 hover:bg-white/60 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#EA000B] transition-colors touch-manipulation"
            aria-label="Zoom out"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
      </MapProvider>
    </div>
  );
}
