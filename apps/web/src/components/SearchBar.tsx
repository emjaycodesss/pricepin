/**
 * Unified search: location → Photon geocode + move map; food → PostGIS dish search + filter pins.
 * Single input; optional "Searching as location" / "Searching as dish" hint.
 */
export function SearchBar() {
  return (
    <input
      type="search"
      placeholder="Search location or dish…"
      className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      aria-label="Search location or dish"
    />
  );
}
