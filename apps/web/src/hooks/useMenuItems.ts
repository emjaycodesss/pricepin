/**
 * Fetches menu items for a food spot (restaurant_id) from Supabase.
 * Used by Sidebar and BottomSheet to display the menu when a spot is selected.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface MenuItemRow {
  id: string;
  item_name: string;
  price: number;
  category: string | null;
  variant_name: string | null;
  description: string | null;
}

export function useMenuItems(spotId: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['menu_items', spotId],
    queryFn: async (): Promise<MenuItemRow[]> => {
      if (!spotId) return [];
      const { data: rows, error: err } = await supabase
        .from('menu_items')
        .select('id, item_name, price, category, variant_name, description')
        .eq('restaurant_id', spotId)
        .order('item_name', { ascending: true });
      if (err) throw err;
      return (rows ?? []).map((r) => ({
        id: r.id,
        item_name: r.item_name ?? '',
        price: Number(r.price) ?? 0,
        category: r.category ?? null,
        variant_name: r.variant_name ?? null,
        description: r.description ?? null,
      }));
    },
    enabled: Boolean(spotId),
    staleTime: 60 * 1000,
  });

  return {
    items: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
