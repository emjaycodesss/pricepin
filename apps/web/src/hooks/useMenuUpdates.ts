/**
 * Fetches menu photo uploads (menu_updates) for a food spot.
 * Used by Sidebar/BottomSheet Gallery tab to show uploaded menu images and their dates.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface MenuUpdateRow {
  id: string;
  menu_photo_url: string;
  uploaded_at: string;
}

export function useMenuUpdates(spotId: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['menu_updates', spotId],
    queryFn: async (): Promise<MenuUpdateRow[]> => {
      if (!spotId) return [];
      const { data: rows, error: err } = await supabase
        .from('menu_updates')
        .select('id, menu_photo_url, uploaded_at')
        .eq('food_spot_id', spotId)
        .order('uploaded_at', { ascending: false });
      if (err) throw err;
      return (rows ?? []).map((r) => ({
        id: r.id,
        menu_photo_url: r.menu_photo_url ?? '',
        uploaded_at: r.uploaded_at ?? '',
      }));
    },
    enabled: Boolean(spotId),
    staleTime: 60 * 1000,
  });

  return {
    updates: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
  };
}

/** Format ISO date as "Uploaded Month, Year" (comma required). */
export function formatUploadedLabel(isoDate: string): string {
  if (!isoDate) return 'Uploaded';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'Uploaded';
  const month = d.toLocaleString('en-PH', { month: 'short' });
  const year = d.getFullYear();
  return `Uploaded ${month}, ${year}`;
}
