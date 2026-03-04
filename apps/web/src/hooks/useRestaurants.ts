/**
 * TanStack Query hook to fetch restaurants from Supabase (PostGIS). Optional: bounds, dish filter, price filter.
 */
export function useRestaurants() {
  // TODO: useQuery + Supabase client; spatial query or dish search
  return { data: [], isLoading: false, error: null };
}
