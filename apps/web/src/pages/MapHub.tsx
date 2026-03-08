/**
 * Map Hub — route: /. Mobile: unified header (search + filter chips) + map + bottom sheet (nearby list or spot detail).
 * Tablet: sidebar (search, detail, nearby) + map. Add Food Spot uses center pin; focusSpotId after finalize flies to that pin.
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Map, DEFAULT_CENTER, DEFAULT_ZOOM } from '../components/Map';
import { MapFiltersOverlay } from '../components/MapFiltersOverlay';
import { MapMobileHeader } from '../components/MapMobileHeader';
import { BottomSheet } from '../components/BottomSheet';
import { Sidebar } from '../components/Sidebar';
import { useFoodSpots, type FoodSpotWithCoords } from '../hooks/useFoodSpots';
import { useGeolocation } from '../hooks/useGeolocation';
import { reverseGeocode } from '../lib/photon';

export function MapHub() {
  const navigate = useNavigate();
  const location = useLocation();
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [selectedRestaurant, setSelectedRestaurant] = useState<FoodSpotWithCoords | null>(null);
  /** Center pin address (reverse-geocoded); stored for data submission only, not shown in search bar. */
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);
  /** Price range filter; controls map pins and Nearby list. */
  const [priceRange, setPriceRange] = useState({ min: 0, max: 1000 });
  /** Category filter for Discovery (map overlay); null = all. */
  const [discoveryCategory, setDiscoveryCategory] = useState<string | null>(null);
  /** Mobile bottom sheet expanded (dragged up); when true, hide center pin and Add Food Spot on map to avoid clash. */
  const [sheetExpanded, setSheetExpanded] = useState(false);

  const { data: foodSpots } = useFoodSpots();
  const { position: geoPosition, getPosition: getGeoPosition } = useGeolocation();
  /** Bottom padding for map on mobile so center pin stays centered above the drawer (tablet: 0). */
  const MAP_PADDING_BOTTOM_MOBILE = 300;
  const [mapPaddingBottom, setMapPaddingBottom] = useState(0);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const update = () => setMapPaddingBottom(mql.matches ? MAP_PADDING_BOTTOM_MOBILE : 0);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  /** Spot's lowest meal price for filtering (min_nonzero_meal_price or starting_meal_price); null if no menu. */
  const getSpotPrice = useCallback((spot: FoodSpotWithCoords): number | null => {
    const p = spot.min_nonzero_meal_price ?? spot.starting_meal_price;
    if (p == null || Number.isNaN(Number(p))) return null;
    return Number(p);
  }, []);

  /** Filter by price; include spots with no price so grey spots remain visible. */
  const filteredByPrice = useMemo(() => {
    return foodSpots.filter((spot) => {
      const price = getSpotPrice(spot);
      if (price === null) return true;
      return price >= priceRange.min && price <= priceRange.max;
    });
  }, [foodSpots, priceRange, getSpotPrice]);

  /** Apply category filter for map pins and sidebar Nearby list (real-time). */
  const filteredForDisplay = useMemo(() => {
    if (!discoveryCategory) return filteredByPrice;
    return filteredByPrice.filter((s) =>
      (s.category ?? '').toLowerCase().includes(discoveryCategory.toLowerCase())
    );
  }, [filteredByPrice, discoveryCategory]);

  const focusSpotId = (location.state as { focusSpotId?: string } | null)?.focusSpotId;

  /** Search/GPS or autocomplete select: fly map so coords are under center pin; reset selection. */
  const handleLocationSelect = useCallback((lat: number, lng: number) => {
    setSelectedRestaurant(null);
    setCenter([lat, lng]);
    setZoom(15);
  }, []);

  /** Locate (mobile utility stack): move map to user location when they tap Locate. */
  const handleLocateClick = useCallback(() => {
    getGeoPosition();
  }, [getGeoPosition]);
  useEffect(() => {
    if (geoPosition) handleLocationSelect(geoPosition.lat, geoPosition.lng);
  }, [geoPosition?.lat, geoPosition?.lng, handleLocationSelect]);

  /** Map idle (pan/zoom ended): reverse geocode center and show address. */
  const handleMapIdle = useCallback((lat: number, lng: number) => {
    reverseGeocode(lat, lng).then((addr) => {
      if (addr) setCurrentAddress(addr);
    });
  }, []);

  /** Add Food Spot: capture current map center and pass stored center-pin address for form pre-fill. */
  const handleAddRestaurant = useCallback(
    (lat: number, lng: number) => {
      navigate(`/add-foodspot?lat=${lat}&lng=${lng}`, {
        state: currentAddress ? { address: currentAddress } : undefined,
      });
    },
    [navigate, currentAddress]
  );

  /** Select spot and fly map to it (e.g. when clicking "View menu" in popup). */
  const handleMarkerClick = useCallback((spot: FoodSpotWithCoords) => {
    setSelectedRestaurant(spot);
    setCenter([spot.lat, spot.lng]);
    setZoom(15);
  }, []);

  /** Fetch address once on mount for initial center. */
  useEffect(() => {
    reverseGeocode(center[0], center[1]).then((addr) => {
      if (addr) setCurrentAddress(addr);
    });
  }, []);

  /** After finalize: fly to spot and select it, then clear navigation state. */
  useEffect(() => {
    if (!focusSpotId || !foodSpots.length) return;
    const spot = foodSpots.find((r) => r.id === focusSpotId);
    if (!spot) return;
    setCenter([spot.lat, spot.lng]);
    setZoom(15);
    setSelectedRestaurant(spot);
    navigate(location.pathname, { replace: true, state: {} });
  }, [focusSpotId, foodSpots, navigate, location.pathname]);

  /** When returning from Add Food Spot with synced address: fly map to that center (map.flyTo via center/zoom). */
  const centerFromState = (location.state as { center?: [number, number] } | null)?.center;
  useEffect(() => {
    if (!centerFromState || centerFromState.length < 2) return;
    const [lat, lng] = centerFromState;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    setCenter([lat, lng]);
    setZoom(15);
    setSelectedRestaurant(null);
    navigate(location.pathname, { replace: true, state: {} });
  }, [centerFromState?.[0], centerFromState?.[1], navigate, location.pathname]);

  return (
    <div className="relative flex flex-col tablet:flex-row h-screen w-full overflow-hidden">
      {/* Mobile: header with search only; filters live in bottom sheet */}
      <MapMobileHeader
        restaurant={selectedRestaurant}
        onBack={() => setSelectedRestaurant(null)}
        mapCenter={{ lat: center[0], lng: center[1] }}
        onLocationSelect={handleLocationSelect}
        onLocateClick={handleLocateClick}
      />
      <div className="hidden tablet:flex tablet:shrink-0">
        <Sidebar
          restaurant={selectedRestaurant}
          onLocationSelect={handleLocationSelect}
          onBack={() => setSelectedRestaurant(null)}
          mapCenter={{ lat: center[0], lng: center[1] }}
          foodSpots={filteredForDisplay}
          onSpotSelect={handleMarkerClick}
        />
      </div>
      {/* Map: full bleed (header overlays on mobile); flex-1 beside sidebar on tablet */}
      <div className="absolute inset-0 tablet:relative tablet:flex-1 tablet:min-w-0 min-h-0">
        <MapFiltersOverlay
          foodSpots={filteredByPrice}
          priceRange={priceRange}
          onPriceRangeChange={setPriceRange}
          discoveryCategory={discoveryCategory}
          onDiscoveryCategoryChange={setDiscoveryCategory}
        />
        <Map
          center={center}
          zoom={zoom}
          foodSpots={filteredForDisplay}
          onMarkerClick={handleMarkerClick}
          onAddRestaurant={handleAddRestaurant}
          onMapIdle={handleMapIdle}
          spotSelected={!!selectedRestaurant}
          paddingBottom={mapPaddingBottom}
          sheetExpanded={sheetExpanded}
        />
      </div>
      <BottomSheet
        restaurant={selectedRestaurant}
        onBack={() => setSelectedRestaurant(null)}
        foodSpots={filteredForDisplay}
        mapCenter={{ lat: center[0], lng: center[1] }}
        onSpotSelect={handleMarkerClick}
        onAddRestaurant={handleAddRestaurant}
        priceRange={priceRange}
        onPriceRangeChange={setPriceRange}
        discoveryCategory={discoveryCategory}
        onDiscoveryCategoryChange={setDiscoveryCategory}
        categoryCountSpots={filteredByPrice}
        onSheetExpandChange={setSheetExpanded}
      />
    </div>
  );
}
