/**
 * Persistent center pin overlay for Mapbox GL map: SVG pin at viewport center,
 * lift/scale on drag, "Add Food Spot" button that captures map center.
 * Uses useMap(mapId) from react-map-gl to access the map instance.
 */
import { useState, useEffect } from 'react';
import { useMap } from 'react-map-gl';

const PIN_COLOR = '#EA000B';

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="40"
      height="52"
      viewBox="0 0 40 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M20 0C8.954 0 0 8.954 0 20c0 11.046 20 32 20 32s20-20.954 20-32C40 8.954 31.046 0 20 0z"
        fill={PIN_COLOR}
      />
      <circle cx="20" cy="20" r="8" fill="white" fillOpacity="0.9" />
    </svg>
  );
}

interface CenterPinOverlayProps {
  /** Map id passed to useMap() to get the Mapbox map ref. */
  mapId: string;
  onAddRestaurant?: (lat: number, lng: number) => void;
  /** When false, pin and button are hidden (e.g. user clicked a node). */
  visible?: boolean;
}

export function CenterPinOverlay({ mapId, onAddRestaurant, visible = true }: CenterPinOverlayProps) {
  const { [mapId]: mapRef } = useMap();
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const map = mapRef?.getMap?.();
    if (!map) return;
    const onMoveStart = () => setIsDragging(true);
    const onMoveEnd = () => setIsDragging(false);
    map.on('movestart', onMoveStart);
    map.on('moveend', onMoveEnd);
    return () => {
      map.off('movestart', onMoveStart);
      map.off('moveend', onMoveEnd);
    };
  }, [mapRef]);

  const handleAddRestaurant = () => {
    const map = mapRef?.getMap?.();
    if (!map) return;
    const c = map.getCenter();
    onAddRestaurant?.(c.lat, c.lng);
  };

  /* Render with opacity transition when sheet expands; do not unmount so fade-out is visible. */
  return (
    <>
      <div
        className={`absolute inset-0 z-[1000] transition-opacity duration-200 ease-out ${visible ? 'pointer-events-none opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-hidden
      >
        <div
          className="absolute transition-transform duration-150 ease-out drop-shadow-lg"
          style={{
            left: '50%',
            top: '50%',
            transform: isDragging
              ? 'translate(-50%, -100%) translateY(-6px) scale(1.12)'
              : 'translate(-50%, -100%)',
          }}
        >
          <PinIcon />
        </div>
      </div>
      {/* Add Food Spot button: on mobile in bottom sheet; on tablet show here — fade with pin when sheet expanded */}
      <div
        className={`hidden tablet:block absolute left-1/2 bottom-6 -translate-x-1/2 z-[1001] transition-opacity duration-200 ease-out ${visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        <button
          type="button"
          onClick={handleAddRestaurant}
          className="min-h-[44px] px-4 py-2 rounded-lg bg-[#EA000B] text-white text-sm font-semibold shadow-lg hover:bg-[#c20009] transition-colors focus:outline-none"
          aria-label="Add food spot at map center"
        >
          Add Food Spot
        </button>
      </div>
    </>
  );
}
