/**
 * Full-screen Leaflet map with OpenStreetMap tiles, pins, and optional clustering.
 * Used in Map Hub (/). Pins from Supabase/PostGIS; click opens BottomSheet (mobile) or Sidebar (desktop).
 */
export function Map() {
  return (
    <div className="w-full h-full min-h-[400px] bg-gray-200" data-testid="map-container">
      {/* Leaflet map will be mounted here in Phase 1 */}
      <span className="sr-only">Map placeholder — Leaflet integration pending</span>
    </div>
  );
}
