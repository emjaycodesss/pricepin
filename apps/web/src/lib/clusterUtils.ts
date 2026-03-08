/**
 * Group food spots by proximity to detect "spots inside a mall" (or same building).
 * Spots within ~100m are treated as one location → one node with count; click opens directory list.
 */

import type { FoodSpotWithCoords } from '../hooks/useFoodSpots';

/** Grid size in degrees (~111m at equator; groups nearby spots as one "mall"). */
const PROXIMITY_GRID_DEG = 0.001;

function proximityKey(lat: number, lng: number): string {
  const cellLat = Math.floor(lat / PROXIMITY_GRID_DEG) * PROXIMITY_GRID_DEG;
  const cellLng = Math.floor(lng / PROXIMITY_GRID_DEG) * PROXIMITY_GRID_DEG;
  return `${cellLat.toFixed(4)}_${cellLng.toFixed(4)}`;
}

export interface ClusterGroup {
  key: string;
  /** Center of the cluster (average lat/lng) for pin and popup placement. */
  lat: number;
  lng: number;
  spots: FoodSpotWithCoords[];
}

/**
 * Groups food spots by proximity so spots inside the same mall/building become one cluster.
 * Each group gets one node with count; click opens directory list (no spider).
 */
export function groupFoodSpotsByCoords(
  spots: FoodSpotWithCoords[]
): ClusterGroup[] {
  const byKey = new Map<string, FoodSpotWithCoords[]>();
  for (const r of spots) {
    const key = proximityKey(r.lat, r.lng);
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }
  return Array.from(byKey.entries()).map(([key, list]) => {
    const lat = list.reduce((s, x) => s + x.lat, 0) / list.length;
    const lng = list.reduce((s, x) => s + x.lng, 0) / list.length;
    return {
      key,
      lat,
      lng,
      spots: list,
    };
  });
}
