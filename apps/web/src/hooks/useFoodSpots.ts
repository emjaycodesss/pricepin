import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/**
 * Food spot row with lat/lng from food_spots_with_coords view (PostGIS → flat coords).
 * starting_meal_price = min, max_meal_price = max from menu_items; floor_level for multi-level venues.
 */
export interface FoodSpotWithCoords {
  id: string;
  name: string;
  address: string | null;
  category: string | null;
  /** Storefront photo URLs (order preserved). First is used as primary image. */
  storefront_image_urls: string[] | null;
  /** e.g. "1st Floor", "2nd Floor" for mall directory. */
  floor_level: string | null;
  is_vat_inclusive: boolean;
  service_charge_percent: number | null;
  created_at: string;
  lat: number;
  lng: number;
  /** Min price from menu_items (null if no items); used in Location Directory. */
  starting_meal_price: number | null;
  /** Max price from menu_items (null if no items); for price range display. */
  max_meal_price: number | null;
  /** Smallest price > 0 from menu_items (null if none); when starting_meal_price is 0, use this as display min. */
  min_nonzero_meal_price: number | null;
  /** When true, spot is hidden from map (admin marked permanently closed). */
  is_permanently_closed?: boolean;
  /** False until at least one menu item is saved; used for pending-marker and Community Bounty UX. */
  has_menu_data?: boolean;
}

/**
 * Normalize storefront_image_urls from DB: PostgREST usually returns string[] but sometimes
 * array columns can come as a string (e.g. PostgreSQL literal); ensure we always get string[].
 */
function normalizeStorefrontUrls(
  raw: string[] | string | null | undefined
): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const arr = raw.filter((u): u is string => typeof u === 'string' && u.length > 0);
    return arr.length > 0 ? arr : null;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const arr = (parsed as unknown[]).filter((u): u is string => typeof u === 'string' && u.length > 0);
        return arr.length > 0 ? arr : null;
      }
    } catch {
      // Not JSON; try PostgreSQL array literal style {"a","b"}
      const trimmed = raw.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const inner = trimmed.slice(1, -1);
        const parts = inner.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
        const arr = parts.filter((s) => s.length > 0);
        return arr.length > 0 ? arr : null;
      }
    }
  }
  return null;
}

/** Min, max, and smallest non-zero price per spot from menu_items (one pass). */
async function fetchMinMaxPriceBySpot(): Promise<
  Map<string, { min: number; max: number; minNonZero: number | null }>
> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('restaurant_id, price');
  if (error) return new Map();
  const bySpot = new Map<string, { min: number; max: number; minNonZero: number | null }>();
  for (const row of data ?? []) {
    const id = row.restaurant_id as string;
    const price = Number(row.price);
    if (!id || Number.isNaN(price)) continue;
    const existing = bySpot.get(id);
    if (!existing) {
      bySpot.set(id, {
        min: price,
        max: price,
        minNonZero: price > 0 ? price : null,
      });
    } else {
      if (price < existing.min) existing.min = price;
      if (price > existing.max) existing.max = price;
      if (price > 0 && (existing.minNonZero == null || price < existing.minNonZero)) {
        existing.minNonZero = price;
      }
    }
  }
  return bySpot;
}

/**
 * Fetch all food spots with coordinates for map pins.
 * Merges in min menu price from menu_items when view's starting_meal_price is null (RLS/view quirk).
 */
export function useFoodSpots() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['food_spots'],
    queryFn: async (): Promise<FoodSpotWithCoords[]> => {
      const [coordsRes, minMaxPrices] = await Promise.all([
        supabase
          .from('food_spots_with_coords')
          .select('id, name, address, category, storefront_image_urls, floor_level, is_vat_inclusive, service_charge_percent, created_at, lat, lng, starting_meal_price, is_permanently_closed, has_menu_data'),
        fetchMinMaxPriceBySpot(),
      ]);
      if (coordsRes.error) throw coordsRes.error;
      const rows = (coordsRes.data ?? []) as (FoodSpotWithCoords & { starting_meal_price?: number | string | null })[];
      return rows
        .filter((r) => !(r as { is_permanently_closed?: boolean }).is_permanently_closed)
        .map((r) => {
          const fromView = r.starting_meal_price != null ? Number(r.starting_meal_price) : null;
          const minMax = minMaxPrices.get(r.id);
          const starting_meal_price =
            fromView != null && !Number.isNaN(fromView)
              ? fromView
              : minMax !== undefined
                ? minMax.min
                : null;
          const max_meal_price = minMax?.max ?? null;
          const min_nonzero_meal_price = minMax?.minNonZero ?? null;
          const storefront_image_urls = normalizeStorefrontUrls(r.storefront_image_urls);
          const { starting_meal_price: _s, ...rest } = r;
          return {
            ...rest,
            starting_meal_price,
            max_meal_price,
            min_nonzero_meal_price,
            storefront_image_urls,
          };
        });
    },
    staleTime: 60 * 1000,
  });

  return {
    data: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : error,
  };
}
