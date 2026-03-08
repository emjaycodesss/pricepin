/**
 * "Use My Location" — triggers Geolocation API; on success calls onLocation(lat, lng) to center map.
 */
import { useEffect } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';

interface GpsButtonProps {
  onLocation?: (lat: number, lng: number) => void;
}

export function GpsButton({ onLocation }: GpsButtonProps) {
  const { position, loading, error, getPosition } = useGeolocation();

  /** When we get a position (after user click), tell parent to move map. */
  useEffect(() => {
    if (position) onLocation?.(position.lat, position.lng);
  }, [position?.lat, position?.lng, onLocation]);

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={getPosition}
        disabled={loading}
        className="min-w-[44px] min-h-[44px] rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center disabled:opacity-50"
        aria-label="Use my location"
        title={error ?? undefined}
      >
        <span className="text-lg" aria-hidden>
          {loading ? '⋯' : '📍'}
        </span>
      </button>
      {error && (
        <span className="absolute top-full right-0 mt-1 text-xs text-red-600 max-w-[120px] text-right" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
