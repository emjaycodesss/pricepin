/**
 * Browser Geolocation API: get current position for "Use My Location". Handles permission denied.
 */
export function useGeolocation() {
  // TODO: getCurrentPosition, loading/error state
  return { position: null, loading: false, error: null, getPosition: () => {} };
}
