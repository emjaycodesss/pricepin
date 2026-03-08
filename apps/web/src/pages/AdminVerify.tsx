/**
 * Admin Verify — same layout and design as Update Menu page.
 * Two-column grid: left = menu photos (scrollable); right = menu items by category (edit/delete + drag-and-drop).
 * Sticky footer: Verify, Reject (per-update only; removes update + linked items), Delete Spot. Wrapped in AdminLayout (back to overview).
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  adminVerifySpot,
  adminDeleteFoodSpot,
  adminUpdateMenuItem,
  adminDeleteMenuItem,
  adminBatchUpdateMenuItemCategory,
  adminRejectMenuUpdates,
  adminDeleteMenuUpdate,
} from '../lib/adminApi';
import { AdminLayout } from '../components/AdminLayout';

/** Drag payload prefixes (text/plain for broad browser support). */
const DRAG_PREFIX_ITEM = 'item:';
const DRAG_PREFIX_CATEGORY = 'category:';

function getDragPayload(dt: DataTransfer): { type: 'item' | 'category'; id: string } | null {
  const plain = dt.getData('text/plain');
  if (!plain) return null;
  if (plain.startsWith(DRAG_PREFIX_ITEM)) return { type: 'item', id: plain.slice(DRAG_PREFIX_ITEM.length) };
  if (plain.startsWith(DRAG_PREFIX_CATEGORY)) return { type: 'category', id: plain.slice(DRAG_PREFIX_CATEGORY.length) };
  return { type: 'item', id: plain };
}

/** Menu item row from DB — same columns as Update Menu / menu_items table. */
interface MenuItemRow {
  id: string;
  item_name: string;
  price: number;
  category?: string | null;
  variant_name?: string | null;
  description?: string | null;
}

/** Pencil icon for edit action. */
function IconEdit({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

/** Trash icon for delete action. */
function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

const UNCATEGORIZED_LABEL = 'Uncategorized';

/** Group items by category preserving display order (first occurrence order); category key used for drag. */
function groupByCategoryOrdered(items: MenuItemRow[]): { categoryKey: string; displayName: string; items: MenuItemRow[] }[] {
  const order: string[] = [];
  const map = new Map<string, MenuItemRow[]>();
  for (const item of items) {
    const key = (item.category ?? '').trim() || UNCATEGORIZED_LABEL;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }
  return order.map((key) => ({
    categoryKey: key,
    displayName: key,
    items: map.get(key)!,
  }));
}

/** Single menu_update row for the left-column photo(s). */
interface MenuPhotoRow {
  id: string;
  menu_photo_url: string;
  uploaded_at: string;
}

export function AdminVerify() {
  const { spotId: spotIdParam, menuUpdateId } = useParams<{ spotId?: string; menuUpdateId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editVariant, setEditVariant] = useState('');
  const [editDescription, setEditDescription] = useState('');
  /** Display order of items (synced from server; reordered locally on drag). */
  const [orderedItems, setOrderedItems] = useState<MenuItemRow[]>([]);
  /** Drag state: item being dragged → show drop indicators. */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null);
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  const [dropCategoryAfterId, setDropCategoryAfterId] = useState<string | null>(null);
  const [dropEndOfCategoryId, setDropEndOfCategoryId] = useState<string | null>(null);
  /** Grip hover: only that row/category is draggable (avoids input conflict). */
  const [activeDraggableId, setActiveDraggableId] = useState<string | null>(null);
  /** Category reorder: show red line BEFORE this category (for upward reorder). */
  const [catDropBeforeId, setCatDropBeforeId] = useState<string | null>(null);
  /** Category label edit: which category is being edited and the draft label. */
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const [editCategoryLabel, setEditCategoryLabel] = useState('');

  /** Per-update mode: one menu_update_id from queue → show only that update's photo(s) and linked items. */
  const isUpdateMode = Boolean(menuUpdateId);
  const spotId = spotIdParam ?? null;

  /** In update mode: fetch the single menu_update by id; we get food_spot_id and optional batch_id. */
  const { data: singleUpdate, isLoading: singleUpdateLoading } = useQuery({
    queryKey: ['admin', 'menu_update', menuUpdateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_updates')
        .select('id, food_spot_id, menu_photo_url, uploaded_at, batch_id')
        .eq('id', menuUpdateId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: isUpdateMode && Boolean(menuUpdateId),
  });

  const resolvedSpotId = isUpdateMode ? (singleUpdate?.food_spot_id ?? null) : spotId;
  const batchId = (singleUpdate as { batch_id?: string | null } | null)?.batch_id ?? null;

  /** In update mode with batch_id: fetch all menu_updates in the same batch (so admin sees all photos from that session). */
  const { data: batchUpdates = [] } = useQuery({
    queryKey: ['admin', 'menu_updates_batch', batchId],
    queryFn: async (): Promise<MenuPhotoRow[]> => {
      if (!batchId) return [];
      const { data, error } = await supabase
        .from('menu_updates')
        .select('id, menu_photo_url, uploaded_at')
        .eq('batch_id', batchId)
        .order('uploaded_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as MenuPhotoRow[];
    },
    enabled: isUpdateMode && Boolean(batchId),
  });

  /** Fallback when batch_id is null (legacy data): same 15-min window as dashboard so one verify page = one session. */
  const SESSION_WINDOW_MS = 15 * 60 * 1000;
  const { data: sessionUpdatesByTime = [] } = useQuery({
    queryKey: ['admin', 'menu_updates_session_window', resolvedSpotId, singleUpdate?.uploaded_at],
    queryFn: async (): Promise<MenuPhotoRow[]> => {
      if (!resolvedSpotId || !singleUpdate?.uploaded_at) return [];
      const t = new Date(singleUpdate.uploaded_at).getTime();
      const lo = new Date(t - SESSION_WINDOW_MS).toISOString();
      const hi = new Date(t + SESSION_WINDOW_MS).toISOString();
      const { data, error } = await supabase
        .from('menu_updates')
        .select('id, menu_photo_url, uploaded_at')
        .eq('food_spot_id', resolvedSpotId)
        .gte('uploaded_at', lo)
        .lte('uploaded_at', hi)
        .order('uploaded_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as MenuPhotoRow[];
    },
    enabled: isUpdateMode && Boolean(singleUpdate) && !batchId,
  });

  const { data: spot, isLoading: spotLoading } = useQuery({
    queryKey: ['admin', 'spot', resolvedSpotId],
    queryFn: async () => {
      const { data, error } = await supabase.from('food_spots').select('*').eq('id', resolvedSpotId!).single();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(resolvedSpotId),
  });

  /** In spot mode: all menu_updates for the spot (global gallery). */
  const { data: spotModePhotos = [] } = useQuery({
    queryKey: ['admin', 'menu_updates', resolvedSpotId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_updates')
        .select('id, menu_photo_url, uploaded_at')
        .eq('food_spot_id', resolvedSpotId!)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as MenuPhotoRow[];
    },
    enabled: Boolean(resolvedSpotId) && !isUpdateMode,
  });

  /** In update mode: all photos in session (by batch_id or by 15-min time window); else single photo. In spot mode: all photos for the spot. */
  const menuPhotos: MenuPhotoRow[] = isUpdateMode && singleUpdate
    ? batchId && batchUpdates.length > 0
      ? batchUpdates
      : sessionUpdatesByTime.length > 0
        ? sessionUpdatesByTime
        : [{ id: singleUpdate.id, menu_photo_url: singleUpdate.menu_photo_url, uploaded_at: singleUpdate.uploaded_at }]
    : spotModePhotos;

  /** Update-id list for this context (batch, time-window session, or single) so we can fetch items and invalidate correctly. */
  const updateIdsForItems = isUpdateMode && singleUpdate
    ? batchId && batchUpdates.length > 0
      ? batchUpdates.map((p) => p.id)
      : sessionUpdatesByTime.length > 0
        ? sessionUpdatesByTime.map((p) => p.id)
        : [singleUpdate.id]
    : [];

  /** In update mode: items linked to this update or any update in the batch. In spot mode: all items for the spot. */
  const menuItemsQueryKey = ['admin', 'menu_items', resolvedSpotId, isUpdateMode ? (batchId ?? menuUpdateId) : spotId];
  const { data: menuItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: menuItemsQueryKey,
    queryFn: async () => {
      if (isUpdateMode && updateIdsForItems.length > 0) {
        const { data, error } = await supabase
          .from('menu_items')
          .select('*')
          .in('menu_update_id', updateIdsForItems)
          .order('item_name');
        if (error) throw error;
        return (data ?? []) as MenuItemRow[];
      }
      if (isUpdateMode && menuUpdateId) {
        const { data, error } = await supabase
          .from('menu_items')
          .select('*')
          .eq('menu_update_id', menuUpdateId)
          .order('item_name');
        if (error) throw error;
        return (data ?? []) as MenuItemRow[];
      }
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', resolvedSpotId!)
        .order('item_name');
      if (error) throw error;
      return (data ?? []) as MenuItemRow[];
    },
    enabled: Boolean(resolvedSpotId) && (!isUpdateMode || Boolean(singleUpdate)),
  });

  const updateItem = useMutation({
    mutationFn: async ({
      id,
      item_name,
      price,
      category,
      variant_name,
      description,
    }: {
      id: string;
      item_name: string;
      price: number;
      category: string | null;
      variant_name: string | null;
      description: string | null;
    }) => {
      await adminUpdateMenuItem(id, { item_name, price, category, variant_name, description });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: menuItemsQueryKey });
      setEditingId(null);
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      await adminDeleteMenuItem(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: menuItemsQueryKey });
      setEditingId(null);
    },
  });

  /** Update category label for all items in a group (rename category). */
  const updateCategoryLabel = useMutation({
    mutationFn: async ({ itemIds, newCategory }: { itemIds: string[]; newCategory: string | null }) => {
      if (itemIds.length === 0) return;
      await adminBatchUpdateMenuItemCategory(itemIds, newCategory);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: menuItemsQueryKey });
      setEditingCategoryKey(null);
    },
  });

  const verifySpot = useMutation({
    mutationFn: async (spotId: string) => {
      await adminVerifySpot(spotId);
    },
    onSuccess: (_data, spotId) => {
      navigate('/admin-price-pin');
      queryClient.invalidateQueries({ queryKey: ['admin', 'spot', spotId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'priority_queue'] });
      queryClient.invalidateQueries({ queryKey: ['food_spots'] });
    },
  });

  const deleteSpot = useMutation({
    mutationFn: async () => {
      await adminDeleteFoodSpot(resolvedSpotId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food_spots'] });
      navigate('/admin-price-pin');
    },
  });

  /** Reject this session: remove linked menu items, then delete all menu_update(s) in one batch to avoid lag. */
  const rejectUpdate = useMutation({
    mutationFn: async () => {
      if (!menuUpdateId) throw new Error('No update to reject');
      await adminRejectMenuUpdates(batchId ? { batchId } : { menuUpdateIds: updateIdsForItems.length > 0 ? updateIdsForItems : [menuUpdateId] });
    },
    onSuccess: () => {
      navigate('/admin-price-pin');
      queryClient.removeQueries({ queryKey: menuItemsQueryKey });
      queryClient.removeQueries({ queryKey: ['admin', 'menu_update', menuUpdateId] });
      queryClient.removeQueries({ queryKey: ['admin', 'menu_updates_batch', batchId] });
      queryClient.removeQueries({ queryKey: ['admin', 'menu_updates_session_window', resolvedSpotId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'priority_queue'] });
      queryClient.invalidateQueries({ queryKey: ['food_spots'] });
    },
  });

  /** Delete a single photo from this session. Items linked to it get menu_update_id set to null (FK). */
  const deleteOnePhoto = useMutation({
    mutationFn: async (photoUpdateId: string) => {
      await adminDeleteMenuUpdate(photoUpdateId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'menu_update', menuUpdateId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'menu_updates_batch', batchId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'menu_updates_session_window', resolvedSpotId] });
      queryClient.invalidateQueries({ queryKey: menuItemsQueryKey });
    },
  });

  /** Clamp active photo index when photos list changes. */
  useEffect(() => {
    if (menuPhotos.length === 0) setActivePhotoIndex(0);
    else if (activePhotoIndex >= menuPhotos.length) setActivePhotoIndex(menuPhotos.length - 1);
  }, [menuPhotos.length, activePhotoIndex]);

  /** When in update mode and all photos were deleted (e.g. delete-one on last), go back to queue. */
  useEffect(() => {
    if (isUpdateMode && menuPhotos.length === 0 && !singleUpdateLoading && resolvedSpotId) {
      queryClient.invalidateQueries({ queryKey: ['admin', 'priority_queue'] });
      navigate('/admin-price-pin');
    }
  }, [isUpdateMode, menuPhotos.length, singleUpdateLoading, resolvedSpotId, navigate, queryClient]);

  const startEdit = useCallback((item: MenuItemRow) => {
    setEditingId(item.id);
    setEditName(item.item_name ?? '');
    setEditPrice(String(item.price ?? ''));
    setEditCategory((item.category ?? '').trim());
    setEditVariant((item.variant_name ?? '').trim());
    setEditDescription((item.description ?? '').trim());
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingId) return;
    const price = parseFloat(editPrice.replace(/,/g, ''));
    if (Number.isNaN(price) || price < 0) return;
    updateItem.mutate({
      id: editingId,
      item_name: editName.trim(),
      price,
      category: editCategory.trim() || null,
      variant_name: editVariant.trim() || null,
      description: editDescription.trim() || null,
    });
  }, [editingId, editName, editPrice, editCategory, editVariant, editDescription, updateItem]);

  /** Sync display order from server; reorder is local until category change is persisted. */
  useEffect(() => {
    setOrderedItems(menuItems);
  }, [menuItems]);

  // ── Auto-scroll during drag ──────────────────────────────────────────────────
  const scrollRef          = useRef<HTMLDivElement>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollStateRef = useRef<{ delta: number } | null>(null);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    autoScrollStateRef.current = null;
  }, []);

  const startAutoScrollLoop = useCallback(() => {
    if (autoScrollFrameRef.current !== null) return;
    const tick = () => {
      const el    = scrollRef.current;
      const state = autoScrollStateRef.current;
      if (!el || !state) { autoScrollFrameRef.current = null; return; }
      el.scrollBy({ top: state.delta });
      autoScrollFrameRef.current = requestAnimationFrame(tick);
    };
    autoScrollFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    const { top, bottom } = el.getBoundingClientRect();
    const ZONE = 80;
    const y = e.clientY;
    if (y < top + ZONE) {
      autoScrollStateRef.current = { delta: -Math.max(2, Math.round(((top + ZONE - y) / ZONE) * 16)) };
      startAutoScrollLoop();
    } else if (y > bottom - ZONE) {
      autoScrollStateRef.current = { delta: Math.max(2, Math.round(((y - (bottom - ZONE)) / ZONE) * 16)) };
      startAutoScrollLoop();
    } else {
      stopAutoScroll();
    }
  }, [startAutoScrollLoop, stopAutoScroll]);

  const clearDragState = useCallback(() => {
    setDraggingId(null);
    setDraggingCategoryId(null);
    setDropBeforeId(null);
    setDropCategoryAfterId(null);
    setDropEndOfCategoryId(null);
    setActiveDraggableId(null);
    setCatDropBeforeId(null);
    stopAutoScroll();
  }, [stopAutoScroll]);

  /** Move item to before target row (or end of category if beforeId null); persist category change. */
  const moveItem = useCallback(
    (draggedId: string, beforeId: string | null, targetCatKey: string, _targetCatName: string) => {
      const flat = [...orderedItems];
      const fromIdx = flat.findIndex((i) => i.id === draggedId);
      if (fromIdx === -1) return;
      const dragged = flat[fromIdx];
      const without = flat.filter((i) => i.id !== draggedId);
      let toIdx: number;
      if (beforeId === null) {
        // Append to end of the specific target category (not end of all items)
        let lastInCat = -1;
        for (let i = 0; i < without.length; i++) {
          const key = (without[i].category ?? '').trim() || UNCATEGORIZED_LABEL;
          if (key === targetCatKey) lastInCat = i;
        }
        toIdx = lastInCat === -1 ? without.length : lastInCat + 1;
      } else {
        toIdx = without.findIndex((i) => i.id === beforeId);
        if (toIdx === -1) toIdx = without.length;
      }
      const newCat = targetCatKey === UNCATEGORIZED_LABEL ? null : targetCatKey;
      const updated = { ...dragged, category: newCat };
      setOrderedItems([...without.slice(0, toIdx), updated, ...without.slice(toIdx)]);
      if ((dragged.category ?? '').trim() || UNCATEGORIZED_LABEL !== targetCatKey) {
        updateItem.mutate({
          id: draggedId,
          item_name: dragged.item_name,
          price: Number(dragged.price),
          category: newCat,
          variant_name: dragged.variant_name ?? null,
          description: dragged.description ?? null,
        });
      }
    },
    [orderedItems, updateItem],
  );

  /** Reorder categories: move group so it appears after afterCategoryKey. */
  const moveCategoryAfter = useCallback(
    (draggedCategoryKey: string, afterCategoryKey: string) => {
      const groups = groupByCategoryOrdered(orderedItems);
      const fromIdx = groups.findIndex((g) => g.categoryKey === draggedCategoryKey);
      const afterIdx = groups.findIndex((g) => g.categoryKey === afterCategoryKey);
      if (fromIdx === -1 || afterIdx === -1 || draggedCategoryKey === afterCategoryKey) return;
      const reordered = [...groups];
      const [removed] = reordered.splice(fromIdx, 1);
      const insertIdx = reordered.findIndex((g) => g.categoryKey === afterCategoryKey);
      if (insertIdx === -1) return;
      reordered.splice(insertIdx + 1, 0, removed);
      setOrderedItems(reordered.flatMap((g) => g.items));
    },
    [orderedItems],
  );

  /** Reorder categories: move the group with draggedCategoryKey so it appears right before beforeCategoryKey. */
  const moveCategoryBefore = useCallback(
    (draggedCategoryKey: string, beforeCategoryKey: string) => {
      if (draggedCategoryKey === beforeCategoryKey) return;
      const groups = groupByCategoryOrdered(orderedItems);
      const fromIdx = groups.findIndex((g) => g.categoryKey === draggedCategoryKey);
      if (fromIdx === -1) return;
      const reordered = [...groups];
      const [removed] = reordered.splice(fromIdx, 1);
      const beforeIdx = reordered.findIndex((g) => g.categoryKey === beforeCategoryKey);
      if (beforeIdx === -1) return;
      reordered.splice(beforeIdx, 0, removed);
      setOrderedItems(reordered.flatMap((g) => g.items));
    },
    [orderedItems],
  );

  const handleItemDragStart = useCallback((e: React.DragEvent, itemId: string) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    dt.effectAllowed = 'move';
    dt.setData('text/plain', DRAG_PREFIX_ITEM + itemId);
    setDraggingId(itemId);
    setDropCategoryAfterId(null);
    setDropEndOfCategoryId(null);
  }, []);

  const handleItemDragEnd = useCallback(() => clearDragState(), [clearDragState]);

  const handleItemDragOver = useCallback(
    (e: React.DragEvent, rowId: string, catKey: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggingId) {
        setDropBeforeId(rowId);
        setDropCategoryAfterId(null);
        setDropEndOfCategoryId(null);
        setCatDropBeforeId(null);
      } else if (draggingCategoryId) {
        setDropCategoryAfterId(catKey);
        setDropBeforeId(null);
        setDropEndOfCategoryId(null);
        setCatDropBeforeId(null);
      }
    },
    [draggingId, draggingCategoryId],
  );

  const handleItemDrop = useCallback(
    (e: React.DragEvent, targetRowId: string, catKey: string, catName: string) => {
      e.preventDefault();
      e.stopPropagation();
      const payload = getDragPayload(e.dataTransfer);
      if (!payload) return;
      if (payload.type === 'category') {
        if (payload.id !== catKey) moveCategoryAfter(payload.id, catKey);
        clearDragState();
        return;
      }
      if (payload.id === targetRowId) return;
      moveItem(payload.id, targetRowId, catKey, catName);
      clearDragState();
    },
    [moveItem, moveCategoryAfter, clearDragState],
  );

  const handleCategoryDragStart = useCallback((e: React.DragEvent, categoryKey: string) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    dt.effectAllowed = 'move';
    dt.setData('text/plain', DRAG_PREFIX_CATEGORY + categoryKey);
    setDraggingCategoryId(categoryKey);
    setDropBeforeId(null);
    setDropCategoryAfterId(null);
    setDropEndOfCategoryId(null);
  }, []);

  const handleCategoryDragEnd = useCallback(() => clearDragState(), [clearDragState]);

  const handleCategoryDragOver = useCallback(
    (e: React.DragEvent, categoryKey: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggingCategoryId) {
        setDropCategoryAfterId(categoryKey);
        setDropBeforeId(null);
        setDropEndOfCategoryId(null);
        setCatDropBeforeId(null);
      } else if (draggingId) {
        setDropCategoryAfterId(null);
        setDropBeforeId(null);
        setDropEndOfCategoryId(null);
        setCatDropBeforeId(null);
      }
    },
    [draggingCategoryId, draggingId],
  );

  const handleCategoryDrop = useCallback(
    (e: React.DragEvent, catKey: string, _catName: string) => {
      e.preventDefault();
      e.stopPropagation();
      const payload = getDragPayload(e.dataTransfer);
      if (!payload) return;
      if (payload.type === 'category') {
        if (payload.id !== catKey) moveCategoryAfter(payload.id, catKey);
      } else {
        const groups = groupByCategoryOrdered(orderedItems);
        const targetGroup = groups.find((g) => g.categoryKey === catKey);
        const firstInCat = targetGroup?.items[0];
        moveItem(payload.id, firstInCat?.id ?? null, catKey, catKey);
      }
      clearDragState();
    },
    [orderedItems, moveItem, moveCategoryAfter, clearDragState],
  );

  const handleCategoryEndDragOver = useCallback(
    (e: React.DragEvent, categoryKey: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggingId) {
        setDropEndOfCategoryId(categoryKey);
        setDropBeforeId(null);
        setDropCategoryAfterId(null);
        setCatDropBeforeId(null);
      } else if (draggingCategoryId) {
        setDropCategoryAfterId(categoryKey);
        setDropBeforeId(null);
        setDropEndOfCategoryId(null);
        setCatDropBeforeId(null);
      }
    },
    [draggingId, draggingCategoryId],
  );

  /** Start editing a category label. */
  const startEditCategory = useCallback((categoryKey: string) => {
    setEditingCategoryKey(categoryKey);
    setEditCategoryLabel(categoryKey === UNCATEGORIZED_LABEL ? '' : categoryKey);
  }, []);

  /** Save category label: update all items in the group to the new category (or null for Uncategorized). */
  const saveCategoryEdit = useCallback(() => {
    if (editingCategoryKey == null) return;
    const groups = groupByCategoryOrdered(orderedItems);
    const group = groups.find((g) => g.categoryKey === editingCategoryKey);
    if (!group) return;
    const trimmed = editCategoryLabel.trim();
    const newCategory = trimmed === '' || trimmed === UNCATEGORIZED_LABEL ? null : trimmed;
    updateCategoryLabel.mutate({
      itemIds: group.items.map((i) => i.id),
      newCategory,
    });
  }, [editingCategoryKey, editCategoryLabel, orderedItems, updateCategoryLabel]);

  /** Cancel category label edit. */
  const cancelCategoryEdit = useCallback(() => {
    setEditingCategoryKey(null);
  }, []);

  /** Delete entire category (all items in that category). */
  const deleteCategory = useCallback(
    (categoryKey: string) => {
      const groups = groupByCategoryOrdered(orderedItems);
      const group = groups.find((g) => g.categoryKey === categoryKey);
      if (!group) return;
      group.items.forEach((item) => deleteItem.mutate(item.id));
      setOrderedItems((prev) => prev.filter((i) => ((i.category ?? '').trim() || UNCATEGORIZED_LABEL) !== categoryKey));
    },
    [orderedItems, deleteItem],
  );

  const handleCategoryEndDrop = useCallback(
    (e: React.DragEvent, catKey: string, catName: string) => {
      e.preventDefault();
      e.stopPropagation();
      const payload = getDragPayload(e.dataTransfer);
      if (!payload) return;
      if (payload.type === 'category') {
        if (payload.id !== catKey) moveCategoryAfter(payload.id, catKey);
        clearDragState();
        return;
      }
      moveItem(payload.id, null, catKey, catName);
      clearDragState();
    },
    [moveItem, moveCategoryAfter, clearDragState],
  );

  /** Drag over the thin zone ABOVE a category header → indicator before that category. */
  const handleCategoryBeforeDragOver = useCallback(
    (e: React.DragEvent, categoryKey: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggingCategoryId && draggingCategoryId !== categoryKey) {
        setCatDropBeforeId(categoryKey);
        setDropCategoryAfterId(null);
        setDropBeforeId(null);
        setDropEndOfCategoryId(null);
      }
    },
    [draggingCategoryId],
  );

  /** Drop on the thin zone ABOVE a category header → move dragged category before it. */
  const handleCategoryBeforeDrop = useCallback(
    (e: React.DragEvent, categoryKey: string) => {
      e.preventDefault();
      e.stopPropagation();
      const payload = getDragPayload(e.dataTransfer);
      if (!payload) return;
      if (payload.type === 'category' && payload.id !== categoryKey) {
        moveCategoryBefore(payload.id, categoryKey);
      }
      clearDragState();
    },
    [moveCategoryBefore, clearDragState],
  );

  /** Underline-only inputs to match MenuEditorSection (line-based, no boxes). */
  const inputUnderline =
    'w-full min-w-0 bg-transparent border-0 border-b border-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#EA000B] focus:outline-none py-0 leading-tight transition-colors duration-100';

  const loading = (isUpdateMode && (singleUpdateLoading || !singleUpdate)) || !resolvedSpotId || spotLoading;
  const notFound = isUpdateMode && !singleUpdateLoading && !singleUpdate && Boolean(menuUpdateId);

  if (loading) {
    return (
      <AdminLayout showBack fixedHeight title="Verify">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-gray-100">
          <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-[1fr_1fr] tablet:grid-cols-2 tablet:grid-rows-[1fr] gap-4 p-4 overflow-hidden">
            <section className="flex flex-col min-h-0 overflow-hidden rounded-2xl bg-white p-4">
              <div className="flex flex-col h-full min-h-0 items-center justify-center text-center">
                <p className="text-sm font-medium text-gray-500">
                  {isUpdateMode ? 'Loading update…' : 'Loading spot…'}
                </p>
              </div>
            </section>
            <section className="hidden tablet:flex flex-col min-h-0 overflow-hidden rounded-2xl bg-white p-4" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (notFound) {
    return (
      <AdminLayout showBack fixedHeight title="Verify">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-gray-100 p-4">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">Update not found</p>
            <p className="mt-1">This menu update may have been removed. Go back to the queue.</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout showBack fixedHeight title={`Verify: ${spot?.name ?? resolvedSpotId}`}>
      {/* Mobile: flex flex-col so sections stack and page scrolls; tablet: grid two-column fixed height */}
      <div className="flex flex-col min-h-0 bg-gray-100 tablet:flex-1 tablet:min-h-0 tablet:overflow-hidden">
        {/* Mobile: flex flex-col stacking; tablet: grid */}
        <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:grid-rows-[1fr] gap-3 p-3 tablet:gap-4 tablet:p-4 tablet:overflow-hidden tablet:flex-1 tablet:min-h-0">
          {/* Menu photos: takes space it needs on mobile; tablet fixed height */}
          <section className="flex flex-col min-h-0 overflow-hidden rounded-2xl bg-white p-3 tablet:p-4 shrink-0 tablet:shrink tablet:min-h-0">
            <div className="flex flex-col h-auto min-h-0 tablet:h-full">
              <h2 className="text-sm font-semibold text-gray-800 mb-3 shrink-0">
                {isUpdateMode ? 'Evidence for this update' : 'Menu photos'}
              </h2>
              {isUpdateMode && (
                <p className="text-xs text-gray-500 mb-2 shrink-0">Only the photo(s) and items linked to this update — verify text against this evidence only.</p>
              )}
              {menuPhotos.length === 0 ? (
                <div className="flex-1 min-h-[200px] rounded-xl border border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-center px-4">
                  <p className="text-sm font-medium text-gray-500">No menu photos</p>
                  <p className="mt-1 text-xs text-gray-400">Uploads for this spot will appear here.</p>
                </div>
              ) : (
                <>
                  {/* Thumbnail strip — 56×56 on mobile to match Update Menu; in update mode each has delete-photo button */}
                  <div className="flex gap-1.5 overflow-x-auto overflow-y-hidden pb-1.5 pt-1.5 pr-1.5 mb-2 min-w-0 shrink-0">
                    {menuPhotos.map((photo, index) => (
                      <div key={photo.id} className="relative flex-shrink-0 group">
                        <button
                          type="button"
                          onClick={() => setActivePhotoIndex(index)}
                          className={`block w-[56px] h-[56px] tablet:w-[72px] tablet:h-[72px] rounded-lg overflow-hidden border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-1 ${
                            index === activePhotoIndex
                              ? 'border-[#EA000B] shadow-md'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          aria-pressed={index === activePhotoIndex}
                          aria-label={`Select image ${index + 1}`}
                        >
                          <img
                            src={photo.menu_photo_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </button>
                        {isUpdateMode && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteOnePhoto.mutate(photo.id);
                              if (activePhotoIndex >= menuPhotos.length - 1 && activePhotoIndex > 0) {
                                setActivePhotoIndex(activePhotoIndex - 1);
                              }
                            }}
                            disabled={deleteOnePhoto.isPending}
                            className="absolute top-1 right-1 w-7 h-7 rounded-md bg-black/60 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 transition-all disabled:opacity-50"
                            aria-label={`Delete photo ${index + 1}`}
                          >
                            <IconTrash className="w-3.5 h-3.5" aria-hidden />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Active view — flex-1 min-h-[25vh] so image area usable; only inner img area scrolls */}
                  <div className="flex-1 min-h-[25vh] flex flex-col rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 p-1.5 bg-gray-100/80 shrink-0">
                      <span className="text-xs font-medium text-gray-500">
                        Image {activePhotoIndex + 1} of {menuPhotos.length}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(menuPhotos[activePhotoIndex]?.uploaded_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto p-1.5">
                      <img
                        src={menuPhotos[activePhotoIndex]?.menu_photo_url}
                        alt=""
                        className="max-w-full h-auto block"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Menu items: min-h-[500px] on mobile so fully usable when scrolled to; tablet fills grid cell */}
          <section className="flex flex-col min-h-[500px] tablet:min-h-0 overflow-hidden rounded-2xl bg-white p-3 tablet:p-4">
            <div className="flex flex-col h-full min-h-0 overflow-hidden">
              {/* Toolbar — match MenuEditorSection (h2 + count badge) */}
              <div className="flex items-center justify-between mb-2 shrink-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-800">Menu items</h2>
                  {orderedItems.length > 0 && (
                    <span className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                      {orderedItems.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Column labels — item minmax(0,1fr) so it shrinks; action 100px so Save/Cancel fit */}
              {!itemsLoading && orderedItems.length > 0 && (
                <div
                  className="hidden sm:grid sm:grid-cols-[20px_minmax(0,1fr)_130px_80px_100px] gap-x-2 px-1 pb-1.5 mb-0.5 border-b border-gray-100 shrink-0"
                  aria-hidden
                >
                  <span />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Item</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Variant</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-right">Price</span>
                  <span />
                </div>
              )}

              <div
                ref={scrollRef}
                className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto"
                onDragOver={handleContainerDragOver}
                onDragLeave={(e) => {
                  if (!scrollRef.current?.contains(e.relatedTarget as Node)) stopAutoScroll();
                }}
              >
                {itemsLoading ? (
                  <div className="flex flex-col items-center justify-center min-h-[160px] gap-3 text-center">
                    <p className="text-sm font-medium text-gray-500">Loading items…</p>
                  </div>
                ) : orderedItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[160px] gap-3 text-center">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                        <rect x="9" y="3" width="6" height="4" rx="1" />
                        <line x1="9" y1="12" x2="15" y2="12" />
                        <line x1="9" y1="16" x2="13" y2="16" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">No menu items</p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {isUpdateMode ? 'Items extracted from this update’s photo will appear here.' : 'Items linked to this spot will appear here.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col pb-2">
                    {groupByCategoryOrdered(orderedItems).map(({ categoryKey, displayName, items: groupItems }) => (
                      <div
                        key={categoryKey}
                        className={`mb-5 transition-opacity duration-200 ease-out ${draggingCategoryId === categoryKey ? 'opacity-40 pointer-events-none' : ''}`}
                      >
                        {/* Drop zone BEFORE this category — captures upward category drag for reorder */}
                        <div
                          onDragOver={(e) => handleCategoryBeforeDragOver(e, categoryKey)}
                          onDragEnter={(e) => e.preventDefault()}
                          onDrop={(e) => handleCategoryBeforeDrop(e, categoryKey)}
                          className="h-4 -mx-1"
                          aria-hidden
                        />
                        {catDropBeforeId === categoryKey && (
                          <div className="h-[2px] bg-[#EA000B] rounded-full mx-1 mb-1 pointer-events-none" aria-hidden />
                        )}

                        {/* Category header — draggable; edit/save/cancel for label, or view with Edit + Delete */}
                        <div
                          draggable={activeDraggableId === categoryKey && editingCategoryKey !== categoryKey}
                          onDragStart={(e) => handleCategoryDragStart(e, categoryKey)}
                          onDragEnd={handleCategoryDragEnd}
                          onDragOver={(e) => handleCategoryDragOver(e, categoryKey)}
                          onDragEnter={(e) => e.preventDefault()}
                          onDrop={(e) => handleCategoryDrop(e, categoryKey, displayName)}
                          className="font-sans flex items-center gap-2 pl-1 pr-1 py-1.5 mb-1 border-l-[3px] border-[#EA000B] bg-gradient-to-r from-red-50/60 to-transparent rounded-r-lg transition-colors duration-150"
                        >
                          <div
                            onMouseEnter={() => setActiveDraggableId(categoryKey)}
                            onMouseLeave={() => setActiveDraggableId(null)}
                            className="flex items-center justify-center w-6 h-6 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 shrink-0 select-none pointer-events-auto transition-colors duration-150"
                            aria-label="Drag to reorder category"
                          >
                            <GripVertical className="w-3.5 h-3.5 pointer-events-none" />
                          </div>
                          {editingCategoryKey === categoryKey ? (
                            <>
                              <input
                                value={editCategoryLabel}
                                onChange={(e) => setEditCategoryLabel(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveCategoryEdit();
                                  if (e.key === 'Escape') cancelCategoryEdit();
                                }}
                                placeholder="Category name"
                                className="flex-1 min-w-0 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-700 bg-white/80 border border-gray-200 rounded px-1.5 py-0.5 focus:border-[#EA000B] focus:outline-none"
                                aria-label="Category name"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={saveCategoryEdit}
                                disabled={updateCategoryLabel.isPending}
                                className="shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded bg-[#EA000B] text-white hover:bg-[#c20009] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelCategoryEdit}
                                className="shrink-0 px-2 py-0.5 text-[10px] font-medium rounded text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B]"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-700 min-w-0 truncate flex-1">
                                {displayName}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); startEditCategory(categoryKey); }}
                                className="flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-[#EA000B] transition-colors duration-150 shrink-0 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
                                aria-label={`Edit category ${displayName}`}
                              >
                                <IconEdit className="w-3.5 h-3.5" aria-hidden />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); deleteCategory(categoryKey); }}
                                disabled={deleteItem.isPending}
                                className="flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-red-500 transition-colors duration-150 shrink-0 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 disabled:opacity-50"
                                aria-label={`Delete category ${displayName}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden />
                              </button>
                            </>
                          )}
                        </div>

                        {/* Item rows — grip column, drop indicator, line-based row (same grid as MenuEditorSection) */}
                        {groupItems.map((item, index) => {
                          const showDropLine = dropBeforeId === item.id && draggingId !== item.id;
                          return (
                            <div key={item.id}>
                              {showDropLine && (
                                <div className="h-[2px] bg-[#EA000B] rounded-full mx-1 my-0.5 pointer-events-none" aria-hidden />
                              )}
                              <div
                                draggable={activeDraggableId === item.id}
                                onDragStart={(e) => handleItemDragStart(e, item.id)}
                                onDragEnd={handleItemDragEnd}
                                onDragOver={(e) => handleItemDragOver(e, item.id, categoryKey)}
                                onDragEnter={(e) => e.preventDefault()}
                                onDrop={(e) => handleItemDrop(e, item.id, categoryKey, displayName)}
                                className={[
                                  'group grid grid-cols-[20px_minmax(0,1fr)_100px] sm:grid-cols-[20px_minmax(0,1fr)_130px_80px_100px] gap-x-2 items-start px-1 py-1 rounded-lg transition-[background-color,opacity] duration-200 ease-out',
                                  draggingId === item.id ? 'opacity-30 pointer-events-none' : '',
                                  editingId === item.id ? 'bg-gray-50' : 'hover:bg-gray-50/70',
                                ].join(' ')}
                                role="row"
                              >
                                {/* Grip — hover enables draggable for this row only */}
                                <div
                                  onMouseEnter={() => setActiveDraggableId(item.id)}
                                  onMouseLeave={() => setActiveDraggableId(null)}
                                  className="flex items-center justify-center h-7 min-w-[20px] cursor-grab active:cursor-grabbing text-gray-300 group-hover:text-gray-500 transition-colors duration-150 shrink-0 select-none pointer-events-auto"
                                  aria-label="Drag to reorder"
                                >
                                  <GripVertical className="w-3.5 h-3.5 pointer-events-none" />
                                </div>

                                {editingId === item.id ? (
                                  /* Edit mode: underline inputs, note (not description) */
                                  <>
                                    <div className="min-w-0 flex flex-col col-span-1">
                                      <input
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className={`${inputUnderline} h-7`}
                                        placeholder="Item name"
                                        aria-label={`Item name ${index + 1}`}
                                      />
                                      <div className="sm:hidden flex items-center gap-2 mt-1.5">
                                        <input
                                          value={editVariant}
                                          onChange={(e) => setEditVariant(e.target.value)}
                                          placeholder="Variant"
                                          className="flex-1 min-w-0 bg-transparent border-0 border-b border-transparent text-xs text-gray-700 placeholder:text-gray-400 focus:border-[#EA000B] focus:outline-none py-0 h-5 leading-tight transition-colors"
                                          aria-label={`Variant ${index + 1}`}
                                        />
                                        <div className="flex items-center gap-0.5 shrink-0">
                                          <span className="text-xs text-gray-500" aria-hidden>₱</span>
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={editPrice}
                                            onChange={(e) => setEditPrice(e.target.value)}
                                            placeholder="0"
                                            className="w-14 min-w-0 bg-transparent border-0 border-b border-transparent text-xs text-gray-700 placeholder:text-gray-400 focus:border-[#EA000B] focus:outline-none py-0 h-5 text-right leading-tight transition-colors"
                                            aria-label={`Price ${index + 1}`}
                                          />
                                        </div>
                                      </div>
                                      <input
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        placeholder="Add note…"
                                        className="mt-1 w-full min-w-0 bg-transparent border-0 border-b border-gray-200 text-[11px] text-gray-500 placeholder:text-gray-400 focus:border-[#EA000B] focus:outline-none py-0 h-5 leading-tight italic transition-colors"
                                        aria-label={`Note ${index + 1}`}
                                      />
                                    </div>
                                    <div className="hidden sm:block min-w-0">
                                      <input
                                        value={editVariant}
                                        onChange={(e) => setEditVariant(e.target.value)}
                                        placeholder="Solo, Large…"
                                        className={`${inputUnderline} h-7 w-full`}
                                        aria-label={`Variant ${index + 1}`}
                                      />
                                    </div>
                                    <div className="hidden sm:flex items-center gap-0.5 min-w-0">
                                      <span className="text-sm text-gray-500 shrink-0 translate-y-px" aria-hidden>₱</span>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={editPrice}
                                        onChange={(e) => setEditPrice(e.target.value)}
                                        placeholder="0"
                                        className={`${inputUnderline} flex-1 h-7 text-right`}
                                        aria-label={`Price ${index + 1}`}
                                      />
                                    </div>
                                    <div className="flex items-center justify-center gap-1 shrink-0 h-7">
                                      <button
                                        type="button"
                                        onClick={saveEdit}
                                        className="px-2 py-1 rounded text-xs font-semibold bg-[#EA000B] text-white hover:bg-[#c20009] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#EA000B] transition-colors"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingId(null)}
                                        className="px-2 py-1 rounded text-xs font-medium text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#EA000B] transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  /* Read-only: name, variant, price, note (italic); edit/delete on hover */
                                  <>
                                    <div className="min-w-0 flex flex-col">
                                      <span className="text-sm text-gray-900 truncate leading-7">{item.item_name}</span>
                                      <div className="sm:hidden flex items-center gap-2 mt-0.5 text-xs text-gray-600">
                                        <span className="truncate">{item.variant_name || '—'}</span>
                                        <span className="tabular-nums text-gray-700 shrink-0">₱{Number(item.price).toLocaleString()}</span>
                                      </div>
                                      {item.description && item.description.trim() && (
                                        <p className="mt-0.5 text-[11px] text-gray-400 italic truncate">{item.description}</p>
                                      )}
                                    </div>
                                    <div className="hidden sm:block min-w-0 text-sm text-gray-600 truncate self-center leading-7">{item.variant_name ?? '—'}</div>
                                    <div className="hidden sm:block text-sm tabular-nums text-gray-700 self-center text-right leading-7">₱{Number(item.price).toLocaleString()}</div>
                                    <div className="flex items-center justify-center shrink-0 h-7">
                                      <button
                                        type="button"
                                        onClick={() => startEdit(item)}
                                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-[#EA000B] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#EA000B] transition-opacity duration-150"
                                        aria-label={`Edit item ${index + 1}`}
                                      >
                                        <IconEdit />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteItem.mutate(item.id)}
                                        disabled={deleteItem.isPending}
                                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-red-500 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 transition-opacity duration-150 disabled:opacity-50"
                                        aria-label={`Delete item ${index + 1}`}
                                      >
                                        <IconTrash />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Drop indicator at end of category */}
                        {(dropEndOfCategoryId === categoryKey || dropCategoryAfterId === categoryKey) && (
                          <div className="h-[2px] bg-[#EA000B] rounded-full mx-1 my-0.5 pointer-events-none" aria-hidden />
                        )}

                        {/* End-of-category drop zone */}
                        <div
                          onDragOver={(e) => handleCategoryEndDragOver(e, categoryKey)}
                          onDragEnter={(e) => e.preventDefault()}
                          onDrop={(e) => handleCategoryEndDrop(e, categoryKey, displayName)}
                          className="min-h-[8px] -mx-1 rounded-lg transition-colors"
                          aria-hidden
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Sticky footer — stays at bottom of viewport while content scrolls behind (same as Update Menu) */}
        <footer className="sticky bottom-0 z-10 shrink-0 border-t border-gray-200 bg-white px-4 py-4 flex flex-col gap-3">
          {verifySpot.isError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800" role="alert">
              <p className="font-medium">Verify failed</p>
              <p className="mt-0.5">{verifySpot.error instanceof Error ? verifySpot.error.message : 'Could not verify. Try again.'}</p>
            </div>
          )}
          {rejectUpdate.isError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800" role="alert">
              <p className="font-medium">Reject failed</p>
              <p className="mt-0.5">{rejectUpdate.error instanceof Error ? rejectUpdate.error.message : 'Could not remove this update. Try again or delete from DB.'}</p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => resolvedSpotId && verifySpot.mutate(resolvedSpotId)}
              disabled={verifySpot.isPending || !resolvedSpotId}
              className="min-h-[44px] px-6 rounded-xl bg-[#EA000B] text-white text-sm font-semibold hover:bg-[#c20009] disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white transition-colors inline-flex items-center justify-center gap-2"
            >
              {verifySpot.isPending ? 'Verifying…' : 'Verify'}
            </button>
            {isUpdateMode && (
              <button
                type="button"
                onClick={() => rejectUpdate.mutate()}
                disabled={rejectUpdate.isPending}
                className="min-h-[44px] min-w-[120px] px-4 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EA000B] transition-colors inline-flex items-center justify-center disabled:opacity-50"
              >
                {rejectUpdate.isPending ? 'Rejecting…' : 'Reject'}
              </button>
            )}
            <button
              type="button"
              onClick={() => deleteSpot.mutate()}
              disabled={deleteSpot.isPending}
              className="min-h-[44px] min-w-[120px] px-4 rounded-xl border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 transition-colors inline-flex items-center justify-center"
            >
              {deleteSpot.isPending ? 'Deleting…' : 'Delete Spot'}
            </button>
          </div>
        </footer>
      </div>
    </AdminLayout>
  );
}
