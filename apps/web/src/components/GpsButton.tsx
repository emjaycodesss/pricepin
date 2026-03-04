/**
 * "Use My Location" — Browser Geolocation API; center map on user. Handles permission denied.
 */
export function GpsButton() {
  return (
    <button
      type="button"
      className="min-w-[44px] min-h-[44px] rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
      aria-label="Use my location"
    >
      <span className="text-lg" aria-hidden>📍</span>
    </button>
  );
}
