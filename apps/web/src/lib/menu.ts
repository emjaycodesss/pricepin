/**
 * Persist menu items for a restaurant to Supabase.
 * Replaces existing menu_items for the restaurant, then inserts the given items.
 */

import { supabase } from './supabase';
import type { MenuEditorItem } from '../components/MenuEditorSection';

export interface SaveMenuResult {
  success: boolean;
  error?: string;
  insertedCount: number;
}

/**
 * Validates and normalizes editor items into rows for DB.
 * Only includes rows with non-empty item_name and valid price > 0.
 * Optionally links all rows to a menu_update (the photo upload they came from).
 */
function toMenuRows(
  spotId: string,
  items: MenuEditorItem[],
  menuUpdateId?: string | null
): { restaurant_id: string; category: string | null; item_name: string; variant_name: string | null; price: number; description: string | null; menu_update_id: string | null }[] {
  const rows: { restaurant_id: string; category: string | null; item_name: string; variant_name: string | null; price: number; description: string | null; menu_update_id: string | null }[] = [];
  for (const item of items) {
    const name = (item.item_name ?? '').trim();
    if (!name) continue;
    const num = Number.parseFloat((item.price ?? '').trim().replace(/,/g, ''));
    if (Number.isNaN(num) || num < 0) continue;
    rows.push({
      restaurant_id: spotId,
      category: (item.category ?? '').trim() || null,
      item_name: name,
      variant_name: (item.variant ?? '').trim() || null,
      price: Math.round(num * 100) / 100,
      description: (item.description ?? '').trim() || null,
      menu_update_id: (item.menu_update_id ?? null) ?? (menuUpdateId ?? null),
    });
  }
  return rows;
}

/**
 * Replace all menu items for a restaurant with the given editor items.
 * Deletes existing rows, then inserts validated rows.
 * Optionally links items to a menu_update (photo upload) via menuUpdateId.
 */
export async function saveMenuItems(
  spotId: string,
  items: MenuEditorItem[],
  menuUpdateId?: string | null
): Promise<SaveMenuResult> {
  const rows = toMenuRows(spotId, items, menuUpdateId);
  if (rows.length === 0) {
    return { success: false, error: 'Add at least one item with a name and price.', insertedCount: 0 };
  }

  const { error: deleteError } = await supabase
    .from('menu_items')
    .delete()
    .eq('restaurant_id', spotId);

  if (deleteError) {
    return { success: false, error: deleteError.message, insertedCount: 0 };
  }

  const { data, error: insertError } = await supabase
    .from('menu_items')
    .insert(rows)
    .select('id');

  if (insertError) {
    return { success: false, error: insertError.message, insertedCount: 0 };
  }

  return { success: true, insertedCount: (data ?? []).length };
}

/**
 * Returns whether the current editor items have at least one valid row (name + price).
 * Uses a dummy restaurant id since we only need the row count.
 */
export function canFinalizeMenu(items: MenuEditorItem[]): boolean {
  return toMenuRows('', items).length > 0;
}
