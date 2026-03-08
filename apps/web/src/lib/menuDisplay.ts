/**
 * Helpers for displaying menu/rates in Sidebar and BottomSheet.
 * - "Rates" label for Samgyup, Buffet, Fine Dining spots; "Menu" otherwise.
 * - Group menu items by category, then by base name (before ' — ') for variant grouping.
 */

import type { MenuItemRow } from '../hooks/useMenuItems';

/** Separator used in item_name to split base name and variant (e.g. "Halo-Halo — Large"). */
export const BASE_VARIANT_SEP = ' — ';

/** Spot categories that use "Rates" instead of "Menu" (buffet, samgyup, fine dining). */
const RATES_CATEGORIES = [
  'Samgyupsal / Grill',
  'Buffet',
  'Restaurant (Casual/Fine Dining)',
] as const;

/** Label for items with no category. */
const UNCATEGORIZED_LABEL = 'Other';

/**
 * Returns true when the food spot category should show "Rates" instead of "Menu".
 */
export function shouldShowRatesLabel(spotCategory: string | null | undefined): boolean {
  if (!spotCategory || typeof spotCategory !== 'string') return false;
  const c = spotCategory.trim();
  if (RATES_CATEGORIES.includes(c as (typeof RATES_CATEGORIES)[number])) return true;
  if (c.toLowerCase().includes('fine dining')) return true;
  if (c.toLowerCase() === 'buffet') return true;
  return false;
}

export interface MenuItemGroup {
  /** Display label for the group (category name or "Other"). */
  categoryLabel: string;
  items: MenuItemRow[];
}

/**
 * Groups menu items by their category. Items with null/empty category go under "Other".
 * Groups are ordered by category name (Other last).
 */
export function groupMenuItemsByCategory(items: MenuItemRow[]): MenuItemGroup[] {
  const byCategory = new Map<string, MenuItemRow[]>();
  for (const item of items) {
    const label = (item.category && item.category.trim()) ? item.category.trim() : UNCATEGORIZED_LABEL;
    const list = byCategory.get(label) ?? [];
    list.push(item);
    byCategory.set(label, list);
  }
  const sorted = Array.from(byCategory.entries())
    .sort(([a], [b]) => {
      if (a === UNCATEGORIZED_LABEL) return 1;
      if (b === UNCATEGORIZED_LABEL) return -1;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    })
    .map(([categoryLabel, groupItems]) => ({ categoryLabel, items: groupItems }));
  return sorted;
}

/** Single variant row under a base name (variant label + price). */
export interface MenuVariantRow {
  id: string;
  variantLabel: string;
  price: number;
}

/** Base name plus its variants for sidebar layout (base in bold, variants indented with dot leaders). */
export interface MenuBaseGroup {
  baseName: string;
  variants: MenuVariantRow[];
}

/**
 * Derives base name and variant label from an item.
 * If item_name contains BASE_VARIANT_SEP, split; otherwise base = item_name, variant = variant_name.
 */
export function getBaseNameAndVariant(item: MenuItemRow): { baseName: string; variantLabel: string } {
  const name = item.item_name ?? '';
  const sep = BASE_VARIANT_SEP;
  if (name.includes(sep)) {
    const idx = name.indexOf(sep);
    return {
      baseName: name.slice(0, idx).trim(),
      variantLabel: name.slice(idx + sep.length).trim(),
    };
  }
  return {
    baseName: name,
    variantLabel: (item.variant_name ?? '').trim(),
  };
}

/**
 * Within a category's items, groups by base name (same name before ' — ').
 * Each group has one base name and a list of variants (id, variant label, price).
 */
export function groupItemsByBaseName(items: MenuItemRow[]): MenuBaseGroup[] {
  const byBase = new Map<string, MenuVariantRow[]>();
  for (const item of items) {
    const { baseName, variantLabel } = getBaseNameAndVariant(item);
    const list = byBase.get(baseName) ?? [];
    list.push({
      id: item.id,
      variantLabel: variantLabel || '—',
      price: item.price ?? 0,
    });
    byBase.set(baseName, list);
  }
  return Array.from(byBase.entries()).map(([baseName, variants]) => ({ baseName, variants }));
}
