import { useState, useCallback } from 'react';

export interface GeoPosition {
  lat: number;
  lng: number;
}

/**
 * Browser Geolocation API for "Use My Location".
 * Returns position (lat/lng), loading and error state, and getPosition() to trigger a request.
 */
export function useGeolocation() {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPosition = useCallback(() => {
    if (!navigator?.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setError(null);
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(
          err.code === 1
            ? 'Location permission denied.'
            : err.code === 2
              ? 'Location unavailable.'
              : 'Could not get location.'
        );
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  return { position, loading, error, getPosition };
}
