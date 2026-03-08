/**
 * MenuEditorSection — high-density, keyboard-first menu editor.
 *
 * Architecture:
 * – Every item carries `_categoryId` (stable UUID) that survives category renames.
 *   This is the ROOT FIX for the letter-by-letter typing bug: React keys are stable
 *   UUIDs, so the category <div> never unmounts/remounts on a name change.
 * – On first load (OCR results), a normalization effect assigns `_categoryId`
 *   based on the item's `category` string, then updates the list once.
 *
 * Design:
 * – Plain grey category headers — no red backgrounds.
 * – Inputs: near-borderless (red underline only on focus).
 * – Note field: hidden until triggered; always visible when filled.
 * – Drag-drop: 2px red drop-indicator line, no bg highlight.
 * – Delete button on item rows: NO background on hover, only colour change.
 *
 * Keyboard:
 * – Tab: Name → Variant → Price (DOM order per row).
 * – Enter in Price → add item to same category, focus new Name.
 * – Escape in Note → collapse.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';

/** text/plain prefix — only format reliably supported in all browsers (Firefox/Safari restrict setData). */
const DRAG_PREFIX_ITEM = 'item:';
const DRAG_PREFIX_CATEGORY = 'category:';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MenuEditorItem {
  id: string;
  category: string;
  item_name: string;
  variant: string;
  price: string;
  description: string;
  /**
   * Stable internal category-group ID — NEVER saved to the DB.
   * Assigned by the normalization effect. Prevents React remounts on rename.
   */
  _categoryId?: string;
  /** Optional link to menu_updates.id (source image). */
  menu_update_id?: string | null;
}

type MenuEditorField = keyof Omit<MenuEditorItem, 'id' | '_categoryId' | 'menu_update_id'>;

interface MenuEditorSectionProps {
  items: MenuEditorItem[];
  onItemsChange: (items: MenuEditorItem[]) => void;
}

interface CategoryGroup {
  categoryId: string;  // stable React key
  displayName: string; // item.category value (may be '' = no name yet)
  items: MenuEditorItem[];
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function newItem(overrides?: Partial<MenuEditorItem>): MenuEditorItem {
  return {
    id: crypto.randomUUID(),
    category: '',
    item_name: '',
    variant: '',
    price: '',
    description: '',
    menu_update_id: null,
    ...overrides,
  };
}

/**
 * Group items by their stable `_categoryId`.
 * Falls back to the category-name string for un-normalised items (OCR imports).
 */
function groupByCategory(items: MenuEditorItem[]): CategoryGroup[] {
  const map = new Map<string, { displayName: string; items: MenuEditorItem[] }>();
  const order: string[] = [];

  for (const item of items) {
    const rawCat = (item.category ?? '').trim();
    const key = item._categoryId ?? (rawCat || '__uncategorized__');

    if (!map.has(key)) {
      map.set(key, { displayName: rawCat, items: [] });
      order.push(key);
    }
    map.get(key)!.items.push(item);
  }

  return order.map((id) => ({
    categoryId: id,
    displayName: map.get(id)!.displayName,
    items: map.get(id)!.items,
  }));
}

function buildFlatList(items: MenuEditorItem[]): MenuEditorItem[] {
  return groupByCategory(items).flatMap((g) => g.items);
}

/** Parse drag payload from dataTransfer (text/plain with prefix — only format that works in all browsers). */
function getDragPayloadFromDataTransfer(dt: DataTransfer): { type: 'item' | 'category'; id: string } | null {
  const plain = dt.getData('text/plain');
  if (!plain) return null;
  if (plain.startsWith(DRAG_PREFIX_ITEM)) return { type: 'item', id: plain.slice(DRAG_PREFIX_ITEM.length) };
  if (plain.startsWith(DRAG_PREFIX_CATEGORY)) return { type: 'category', id: plain.slice(DRAG_PREFIX_CATEGORY.length) };
  return { type: 'item', id: plain };
}

// Shared underline-input style: invisible border until focus → red underline
const inputUnderline =
  'w-full min-w-0 bg-transparent border-0 border-b border-transparent ' +
  'text-sm text-gray-800 placeholder:text-gray-400 ' +
  'focus:border-[#EA000B] focus:outline-none py-0 leading-tight transition-colors duration-100';

// ─── Component ────────────────────────────────────────────────────────────────

export function MenuEditorSection({ items, onItemsChange }: MenuEditorSectionProps) {
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  /** Item drag: id of the item being dragged. */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /** Item drop: show red line before this item id. */
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null);
  /** Category drag: id of the category (_categoryId) being dragged. */
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  /** Category reorder: show red line at bottom of this category (drop after). */
  const [dropCategoryAfterId, setDropCategoryAfterId] = useState<string | null>(null);
  /** When dragging item over end-of-category zone, show red line at bottom of that category. */
  const [dropEndOfCategoryId, setDropEndOfCategoryId] = useState<string | null>(null);
  /** Handle Toggle: id of the row/category whose grip is hovered; only that element is draggable (avoids input conflict). */
  const [activeDraggableId, setActiveDraggableId] = useState<string | null>(null);
  /** Category reorder: show red line BEFORE this category (for upward reorder — drag up). */
  const [catDropBeforeId, setCatDropBeforeId] = useState<string | null>(null);

  // ── One-time normalization: assign stable _categoryId to every item ─────────
  // Runs only when some items lack _categoryId (e.g. freshly imported from OCR).
  // Same category-name string → same UUID; distinct groups are respected.
  useEffect(() => {
    if (!items.some((i) => !i._categoryId)) return; // already normalised

    const nameToId = new Map<string, string>();
    const normalised = items.map((item) => {
      if (item._categoryId) return item;
      const rawCat = (item.category ?? '').trim() || '__uncategorized__';
      if (!nameToId.has(rawCat)) nameToId.set(rawCat, crypto.randomUUID());
      return { ...item, _categoryId: nameToId.get(rawCat)! };
    });
    onItemsChange(normalised);
  }, [items, onItemsChange]);

  // ── Focus management ────────────────────────────────────────────────────────
  const nameRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const catRefs  = useRef<Map<string, HTMLInputElement | null>>(new Map());

  /** After addItem: store the new item's id; flushed by the effect below. */
  const pendingNameFocus = useRef<string | null>(null);
  /** After addCategory: store the new _categoryId; flushed by the effect below. */
  const pendingCatFocus  = useRef<string | null>(null);

  // Runs after every render — flushes one pending focus request.
  // NO el.select() so we never auto-highlight/select existing text.
  useEffect(() => {
    if (pendingNameFocus.current) {
      const el = nameRefs.current.get(pendingNameFocus.current);
      if (el) { el.focus(); pendingNameFocus.current = null; }
    }
    if (pendingCatFocus.current) {
      const el = catRefs.current.get(pendingCatFocus.current);
      if (el) {
        el.focus();
        // Place cursor at the beginning (field is empty = placeholder visible)
        el.setSelectionRange(0, 0);
        pendingCatFocus.current = null;
      }
    }
  });

  // ── Mutations ───────────────────────────────────────────────────────────────

  const updateRow = useCallback(
    (id: string, field: MenuEditorField, value: string) =>
      onItemsChange(items.map((r) => (r.id === id ? { ...r, [field]: value } : r))),
    [items, onItemsChange],
  );

  /**
   * Rename a category: update `category` string on every item that shares
   * the same `_categoryId`. The stable key means no React remount → no focus loss.
   */
  const updateCategoryName = useCallback(
    (categoryId: string, newName: string) =>
      onItemsChange(
        items.map((r) => (r._categoryId === categoryId ? { ...r, category: newName } : r)),
      ),
    [items, onItemsChange],
  );

  const removeRow = useCallback(
    (id: string) => {
      onItemsChange(items.filter((r) => r.id !== id));
      if (expandedNoteId === id) setExpandedNoteId(null);
      if (hoveredRowId  === id) setHoveredRowId(null);
    },
    [items, onItemsChange, expandedNoteId, hoveredRowId],
  );

  const removeCategory = useCallback(
    (categoryId: string) =>
      onItemsChange(items.filter((r) => r._categoryId !== categoryId)),
    [items, onItemsChange],
  );

  /** Add a new item into an existing category group. */
  const addItemToGroup = useCallback(
    (categoryId: string, categoryName: string) => {
      const row = newItem({ category: categoryName, _categoryId: categoryId });
      onItemsChange([...items, row]);
      pendingNameFocus.current = row.id;
    },
    [items, onItemsChange],
  );

  /**
   * Add a new, blank category (empty name = placeholder shown).
   * Uses a fresh UUID as the stable group key.
   */
  const addCategory = useCallback(() => {
    const catId = crypto.randomUUID();
    const row   = newItem({ category: '', _categoryId: catId });
    onItemsChange([...items, row]);
    pendingCatFocus.current = catId;
  }, [items, onItemsChange]);

  const clearAll = useCallback(() => {
    onItemsChange([]);
    setExpandedNoteId(null);
  }, [onItemsChange]);

  // ── Drag-and-drop ───────────────────────────────────────────────────────────

  const moveItem = useCallback(
    (draggedId: string, beforeId: string | null, targetCatId: string, targetCatName: string) => {
      const flat    = buildFlatList(items);
      const fromIdx = flat.findIndex((i) => i.id === draggedId);
      if (fromIdx === -1) return;

      const dragged = { ...flat[fromIdx], category: targetCatName, _categoryId: targetCatId };
      const without = flat.filter((i) => i.id !== draggedId);
      let toIdx: number;
      if (beforeId === null) {
        // Append to end of the specific target category (not end of all items)
        let lastInCat = -1;
        for (let i = 0; i < without.length; i++) {
          if (without[i]._categoryId === targetCatId) lastInCat = i;
        }
        toIdx = lastInCat === -1 ? without.length : lastInCat + 1;
      } else {
        toIdx = without.findIndex((i) => i.id === beforeId);
        if (toIdx === -1) toIdx = without.length;
      }

      onItemsChange([...without.slice(0, toIdx), dragged, ...without.slice(toIdx)]);
    },
    [items, onItemsChange],
  );

  /**
   * Reorder categories: move the group with draggedCategoryId so it appears right after afterCategoryId.
   * Preserves item order within each group. Used with "line at bottom" drop indicator.
   */
  const moveCategoryAfter = useCallback(
    (draggedCategoryId: string, afterCategoryId: string) => {
      const groups = groupByCategory(items);
      const fromIdx = groups.findIndex((g) => g.categoryId === draggedCategoryId);
      const afterIdx = groups.findIndex((g) => g.categoryId === afterCategoryId);
      if (fromIdx === -1 || afterIdx === -1 || draggedCategoryId === afterCategoryId) return;
      const reordered = [...groups];
      const [removed] = reordered.splice(fromIdx, 1);
      const insertIdx = reordered.findIndex((g) => g.categoryId === afterCategoryId);
      if (insertIdx === -1) return;
      reordered.splice(insertIdx + 1, 0, removed);
      const flat = reordered.flatMap((g) => g.items);
      onItemsChange(flat);
    },
    [items, onItemsChange],
  );

  /**
   * Reorder categories: move the group with draggedCategoryId so it appears right before beforeCategoryId.
   * Preserves item order within each group. Used with "line at top" drop indicator.
   */
  const moveCategoryBefore = useCallback(
    (draggedCategoryId: string, beforeCategoryId: string) => {
      if (draggedCategoryId === beforeCategoryId) return;
      const grps = groupByCategory(items);
      const fromIdx = grps.findIndex((g) => g.categoryId === draggedCategoryId);
      if (fromIdx === -1) return;
      const reordered = [...grps];
      const [removed] = reordered.splice(fromIdx, 1);
      const beforeIdx = reordered.findIndex((g) => g.categoryId === beforeCategoryId);
      if (beforeIdx === -1) return;
      reordered.splice(beforeIdx, 0, removed);
      onItemsChange(reordered.flatMap((g) => g.items));
    },
    [items, onItemsChange],
  );

  const groups = groupByCategory(items);

  // ── Auto-scroll during drag ──────────────────────────────────────────────────
  // HTML5 DnD does not auto-scroll overflow containers — only the viewport.
  // We detect edge-proximity on dragover and drive scrollBy in a rAF loop.
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
    if (autoScrollFrameRef.current !== null) return; // loop already running
    const tick = () => {
      const el    = scrollRef.current;
      const state = autoScrollStateRef.current;
      if (!el || !state) { autoScrollFrameRef.current = null; return; }
      el.scrollBy({ top: state.delta });
      autoScrollFrameRef.current = requestAnimationFrame(tick);
    };
    autoScrollFrameRef.current = requestAnimationFrame(tick);
  }, []);

  /** Called on dragover of the scroll container — updates direction + speed and starts the loop. */
  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    const { top, bottom } = el.getBoundingClientRect();
    const ZONE = 80; // px from edge where scroll activates
    const y = e.clientY;
    if (y < top + ZONE) {
      // Near top: scroll up — closer to edge = faster
      autoScrollStateRef.current = { delta: -Math.max(2, Math.round(((top + ZONE - y) / ZONE) * 16)) };
      startAutoScrollLoop();
    } else if (y > bottom - ZONE) {
      // Near bottom: scroll down
      autoScrollStateRef.current = { delta: Math.max(2, Math.round(((y - (bottom - ZONE)) / ZONE) * 16)) };
      startAutoScrollLoop();
    } else {
      stopAutoScroll();
    }
  }, [startAutoScrollLoop, stopAutoScroll]);

  // ── React-based drag handlers (onDragStart/End/Over/Enter/Drop on rows) ─────

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

  const handleItemDragStart = useCallback(
    (e: React.DragEvent, itemId: string) => {
      const dt = e.dataTransfer;
      if (!dt) return;
      dt.effectAllowed = 'move';
      dt.setData('text/plain', DRAG_PREFIX_ITEM + itemId);
      setDraggingId(itemId);
      setDropCategoryAfterId(null);
      setDropEndOfCategoryId(null);
      try {
        if (e.currentTarget) dt.setDragImage(e.currentTarget, 10, 10);
      } catch {
        // setDragImage can fail in some browsers
      }
    },
    [],
  );

  const handleItemDragEnd = useCallback(() => {
    clearDragState();
  }, [clearDragState]);

  const handleItemDragOver = useCallback(
    (e: React.DragEvent, rowId: string, catId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggingId) {
        setDropBeforeId(rowId);
        setDropCategoryAfterId(null);
        setDropEndOfCategoryId(null);
        setCatDropBeforeId(null);
      } else if (draggingCategoryId) {
        setDropCategoryAfterId(catId);
        setDropBeforeId(null);
        setDropEndOfCategoryId(null);
        setCatDropBeforeId(null);
      }
    },
    [draggingId, draggingCategoryId],
  );

  const handleItemDrop = useCallback(
    (e: React.DragEvent, targetRowId: string, catId: string, catName: string) => {
      e.preventDefault();
      e.stopPropagation();
      const payload = getDragPayloadFromDataTransfer(e.dataTransfer);
      if (!payload) return;
      if (payload.type === 'category') {
        if (payload.id !== catId) moveCategoryAfter(payload.id, catId);
        clearDragState();
        return;
      }
      if (payload.id === targetRowId) return;
      moveItem(payload.id, targetRowId, catId, catName);
      clearDragState();
    },
    [moveItem, moveCategoryAfter, clearDragState],
  );

  const handleCategoryDragStart = useCallback(
    (e: React.DragEvent, categoryId: string) => {
      const dt = e.dataTransfer;
      if (!dt) return;
      dt.effectAllowed = 'move';
      dt.setData('text/plain', DRAG_PREFIX_CATEGORY + categoryId);
      setDraggingCategoryId(categoryId);
      setDropBeforeId(null);
      setDropCategoryAfterId(null);
      setDropEndOfCategoryId(null);
      try {
        if (e.currentTarget) dt.setDragImage(e.currentTarget, 10, 10);
      } catch {
        // ignore
      }
    },
    [],
  );

  const handleCategoryDragEnd = useCallback(() => {
    clearDragState();
  }, [clearDragState]);

  const handleCategoryDragOver = useCallback(
    (e: React.DragEvent, categoryId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggingCategoryId) {
        setDropCategoryAfterId(categoryId);
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
    (e: React.DragEvent, catId: string, catName: string) => {
      e.preventDefault();
      e.stopPropagation();
      const payload = getDragPayloadFromDataTransfer(e.dataTransfer);
      if (!payload) return;
      if (payload.type === 'category') {
        if (payload.id !== catId) moveCategoryAfter(payload.id, catId);
      } else {
        const flat = buildFlatList(items);
        const firstInCat = flat.find((i) => i.id !== payload.id && i._categoryId === catId);
        moveItem(payload.id, firstInCat?.id ?? null, catId, catName);
      }
      clearDragState();
    },
    [items, moveItem, moveCategoryAfter, clearDragState],
  );

  const handleCategoryEndDragOver = useCallback(
    (e: React.DragEvent, categoryId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggingId) {
        setDropEndOfCategoryId(categoryId);
        setDropBeforeId(null);
        setDropCategoryAfterId(null);
        setCatDropBeforeId(null);
      } else if (draggingCategoryId) {
        setDropCategoryAfterId(categoryId);
        setDropBeforeId(null);
        setDropEndOfCategoryId(null);
        setCatDropBeforeId(null);
      }
    },
    [draggingId, draggingCategoryId],
  );

  const handleCategoryEndDrop = useCallback(
    (e: React.DragEvent, catId: string, catName: string) => {
      e.preventDefault();
      e.stopPropagation();
      const payload = getDragPayloadFromDataTransfer(e.dataTransfer);
      if (!payload) return;
      if (payload.type === 'category') {
        if (payload.id !== catId) moveCategoryAfter(payload.id, catId);
        clearDragState();
        return;
      }
      moveItem(payload.id, null, catId, catName);
      clearDragState();
    },
    [moveItem, moveCategoryAfter, clearDragState],
  );

  /** Drag over the thin zone ABOVE a category header → indicator before that category. */
  const handleCategoryBeforeDragOver = useCallback(
    (e: React.DragEvent, categoryId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggingCategoryId && draggingCategoryId !== categoryId) {
        setCatDropBeforeId(categoryId);
        setDropCategoryAfterId(null);
        setDropBeforeId(null);
        setDropEndOfCategoryId(null);
      }
    },
    [draggingCategoryId],
  );

  /** Drop on the thin zone ABOVE a category header → move dragged category before it. */
  const handleCategoryBeforeDrop = useCallback(
    (e: React.DragEvent, categoryId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const payload = getDragPayloadFromDataTransfer(e.dataTransfer);
      if (!payload) return;
      if (payload.type === 'category' && payload.id !== categoryId) {
        moveCategoryBefore(payload.id, categoryId);
      }
      clearDragState();
    },
    [moveCategoryBefore, clearDragState],
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800">Menu items</h2>
          {items.length > 0 && (
            <span className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
              {items.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* + Category: create a new empty-named group */}
          <button
            type="button"
            onClick={addCategory}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-gray-100 text-[12px] font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#EA000B] transition-colors"
          >
            <Plus className="w-3 h-3" aria-hidden />
            Category
          </button>

          {items.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="h-7 px-2.5 rounded-md text-[12px] font-medium text-red-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* ── Column labels (desktop only, outside scroll area) ── */}
      {groups.length > 0 && (
        <div
          className="hidden sm:grid grid-cols-[20px_1fr_130px_80px_28px] gap-x-2 px-1 pb-1.5 mb-0.5 border-b border-gray-100 shrink-0"
          aria-hidden
        >
          <span />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Item</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Variant</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-right">Price</span>
          <span />
        </div>
      )}

      {/* ── Scrollable body ── */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto"
        onDragOver={handleContainerDragOver}
        onDragLeave={(e) => {
          // Only stop when truly leaving the container, not just moving between children
          if (!scrollRef.current?.contains(e.relatedTarget as Node)) stopAutoScroll();
        }}
      >

        {groups.length === 0 ? (
          /* Empty state */
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
              <p className="text-sm font-medium text-gray-500">No items yet</p>
              <p className="mt-0.5 text-xs text-gray-400">Scan a menu photo or add a category to start.</p>
            </div>
          </div>

        ) : (
          <div className="flex flex-col pb-2">

            {groups.map((group) => {
              const { categoryId, displayName, items: groupItems } = group;

              return (
                <div
                  key={categoryId}
                  className={`mb-5 transition-opacity duration-200 ease-out ${draggingCategoryId === categoryId ? 'opacity-40 pointer-events-none' : ''}`}
                >

                  {/* Drop zone BEFORE this category — captures upward category drag for reorder */}
                  <div
                    onDragOver={(e) => handleCategoryBeforeDragOver(e, categoryId)}
                    onDragEnter={(e) => e.preventDefault()}
                    onDrop={(e) => handleCategoryBeforeDrop(e, categoryId)}
                    className="h-4 -mx-1"
                    aria-hidden
                  />
                  {catDropBeforeId === categoryId && (
                    <div className="h-[2px] bg-[#EA000B] rounded-full mx-1 mb-1 pointer-events-none" aria-hidden />
                  )}

                  {/* ── Category header: draggable only when grip is hovered (activeDraggableId === categoryId) ── */}
                  <div
                    draggable={activeDraggableId === categoryId}
                    onDragStart={(e) => handleCategoryDragStart(e, categoryId)}
                    onDragEnd={handleCategoryDragEnd}
                    onDragOver={(e) => handleCategoryDragOver(e, categoryId)}
                    onDragEnter={(e) => e.preventDefault()}
                    onDrop={(e) => handleCategoryDrop(e, categoryId, displayName)}
                    className="font-sans flex items-center gap-2 pl-1 pr-1 py-1.5 mb-1 border-l-[3px] border-[#EA000B] bg-gradient-to-r from-red-50/60 to-transparent rounded-r-lg transition-colors duration-150"
                  >
                    {/* Grip: hover sets activeDraggableId so this row becomes the only draggable; cursor-grab + pointer-events-auto */}
                    <div
                      onMouseEnter={() => setActiveDraggableId(categoryId)}
                      onMouseLeave={() => setActiveDraggableId(null)}
                      className="flex items-center justify-center w-6 h-6 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 shrink-0 select-none pointer-events-auto transition-colors duration-150"
                      aria-label="Drag to reorder category"
                    >
                      <GripVertical className="w-3.5 h-3.5 pointer-events-none" />
                    </div>
                    {/*
                      Category name input.
                      value={displayName} where displayName starts as '' → shows placeholder.
                      Stable key (categoryId) means this input is NEVER remounted on rename,
                      so the user can type continuously without losing focus.
                    */}
                    <input
                      ref={(el) => { catRefs.current.set(categoryId, el); }}
                      type="text"
                      value={displayName}
                      onChange={(e) => updateCategoryName(categoryId, e.target.value)}
                      placeholder="New Category"
                      className="font-sans flex-1 min-w-0 bg-transparent border-0 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-700 placeholder:text-gray-400 placeholder:normal-case placeholder:tracking-normal focus:outline-none"
                      aria-label="New Category"
                    />

                    {/* Delete category — no confirmation */}
                    <button
                      type="button"
                      onClick={() => removeCategory(categoryId)}
                      className="flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-red-500 transition-colors duration-150 shrink-0 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
                      aria-label={`Delete ${displayName || 'unnamed category'}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </div>

                  {/* ── Item rows ── */}
                  {groupItems.map((row) => {
                    const isDragging   = draggingId === row.id;
                    const showDropLine = dropBeforeId === row.id && draggingId !== row.id;
                    const isHovered    = hoveredRowId === row.id;
                    const hasNote      = row.description.trim().length > 0;
                    const noteExpanded = expandedNoteId === row.id;

                    return (
                      <div key={row.id}>

                        {/* Drop indicator: 2px red line with subtle fade-in */}
                        {showDropLine && (
                          <div className="menu-drop-indicator h-[2px] bg-[#EA000B] rounded-full mx-1 my-0.5 pointer-events-none" aria-hidden />
                        )}

                        <div
                          draggable={activeDraggableId === row.id}
                          onDragStart={(e) => handleItemDragStart(e, row.id)}
                          onDragEnd={handleItemDragEnd}
                          onDragOver={(e) => handleItemDragOver(e, row.id, categoryId)}
                          onDragEnter={(e) => e.preventDefault()}
                          onDrop={(e) => handleItemDrop(e, row.id, categoryId, displayName)}
                          onMouseEnter={() => setHoveredRowId(row.id)}
                          onMouseLeave={() => setHoveredRowId(null)}
                          className={[
                            'group grid grid-cols-[20px_1fr_28px] sm:grid-cols-[20px_1fr_130px_80px_28px]',
                            'gap-x-2 items-start px-1 py-1 rounded-lg transition-[background-color,opacity] duration-200 ease-out',
                            isDragging ? 'opacity-30 pointer-events-none' : '',
                            (isHovered || noteExpanded) ? 'bg-gray-50' : 'hover:bg-gray-50/70',
                          ].join(' ')}
                          role="row"
                        >

                          {/* Grip: hover sets activeDraggableId so this row becomes the only draggable; cursor-grab + pointer-events-auto */}
                          <div
                            onMouseEnter={() => setActiveDraggableId(row.id)}
                            onMouseLeave={() => setActiveDraggableId(null)}
                            className="flex items-center justify-center h-7 min-w-[20px] cursor-grab active:cursor-grabbing text-gray-300 group-hover:text-gray-500 transition-colors duration-150 shrink-0 select-none pointer-events-auto"
                            aria-label="Drag to reorder"
                          >
                            <GripVertical className="w-3.5 h-3.5 pointer-events-none" />
                          </div>

                          {/* ── Name column (+ mobile sub-row + note trigger) ── */}
                          <div className="min-w-0 flex flex-col">

                            {/* Item name input */}
                            <input
                              ref={(el) => { nameRefs.current.set(row.id, el); }}
                              type="text"
                              value={row.item_name}
                              onChange={(e) => updateRow(row.id, 'item_name', e.target.value)}
                              placeholder="Item name"
                              className={`${inputUnderline} h-7`}
                              aria-label="Item name"
                            />

                            {/* Mobile only: variant + price stacked below name */}
                            <div className="sm:hidden flex items-center gap-2 mt-1.5">
                              <input
                                type="text"
                                value={row.variant}
                                onChange={(e) => updateRow(row.id, 'variant', e.target.value)}
                                placeholder="Variant"
                                className="flex-1 min-w-0 bg-transparent border-0 border-b border-transparent text-xs text-gray-700 placeholder:text-gray-400 focus:border-[#EA000B] focus:outline-none py-0 h-5 leading-tight transition-colors"
                                aria-label="Variant"
                              />
                              <div className="flex items-center gap-0.5 shrink-0">
                                <span className="text-xs text-gray-500" aria-hidden>₱</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.price}
                                  onChange={(e) => updateRow(row.id, 'price', e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      addItemToGroup(categoryId, displayName);
                                    }
                                  }}
                                  placeholder="0"
                                  className="w-14 min-w-0 bg-transparent border-0 border-b border-transparent text-xs text-gray-700 placeholder:text-gray-400 focus:border-[#EA000B] focus:outline-none py-0 h-5 text-right leading-tight transition-colors"
                                  aria-label="Price"
                                />
                              </div>
                            </div>

                            {/*
                              Note / description — hidden-until-needed:
                              1. Expanded: editable input; blur with empty → collapses.
                              2. Has content: dim italic text; click to edit.
                              3. Empty: "+ note" visible only on row hover (desktop)
                                 or always visible on mobile (no hover state).
                            */}
                            {noteExpanded ? (
                              <input
                                type="text"
                                value={row.description}
                                onChange={(e) => updateRow(row.id, 'description', e.target.value)}
                                placeholder="Add note…"
                                autoFocus
                                onBlur={(e) => {
                                  if (!e.currentTarget.value.trim()) setExpandedNoteId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') { e.preventDefault(); setExpandedNoteId(null); }
                                }}
                                className="mt-1 w-full min-w-0 bg-transparent border-0 border-b border-gray-200 text-[11px] text-gray-500 placeholder:text-gray-400 focus:border-[#EA000B] focus:outline-none py-0 h-5 leading-tight italic transition-colors"
                                aria-label="Item note"
                              />
                            ) : hasNote ? (
                              /* Show note content; click to edit */
                              <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => setExpandedNoteId(row.id)}
                                className="text-left mt-0.5 text-[11px] text-gray-400 italic hover:text-gray-600 focus:outline-none truncate w-full"
                              >
                                {row.description}
                              </button>
                            ) : (
                              /* Empty: hidden on sm+ until hover; always shown on mobile */
                              <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => setExpandedNoteId(row.id)}
                                className="text-left mt-0.5 text-[11px] text-gray-400 hover:text-[#EA000B] focus:outline-none transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                              >
                                + note
                              </button>
                            )}
                          </div>

                          {/* ── Variant (desktop grid cell) ── */}
                          <div className="hidden sm:block min-w-0">
                            <input
                              type="text"
                              value={row.variant}
                              onChange={(e) => updateRow(row.id, 'variant', e.target.value)}
                              placeholder="Solo, Large…"
                              className={`${inputUnderline} h-7`}
                              aria-label="Variant"
                            />
                          </div>

                          {/* ── Price (desktop grid cell) ── */}
                          <div className="hidden sm:flex items-center gap-0.5">
                            <span className="text-sm text-gray-500 shrink-0 translate-y-px" aria-hidden>₱</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.price}
                              onChange={(e) => updateRow(row.id, 'price', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addItemToGroup(categoryId, displayName);
                                }
                              }}
                              placeholder="0"
                              className={`${inputUnderline} flex-1 h-7 text-right`}
                              aria-label="Price"
                            />
                          </div>

                          {/*
                            Delete button — NO background on hover, only colour.
                            tabIndex={-1} keeps Tab flow clean (Name→Variant→Price).
                          */}
                          <div className="flex items-center justify-center shrink-0 h-7">
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => removeRow(row.id)}
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-red-500 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 transition-opacity duration-150"
                              aria-label="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden />
                            </button>
                          </div>

                        </div>
                      </div>
                    );
                  })}

                  {/* Drop indicator at bottom only: subtle fade-in */}
                  {(dropEndOfCategoryId === categoryId || dropCategoryAfterId === categoryId) && (
                    <div className="menu-drop-indicator h-[2px] bg-[#EA000B] rounded-full mx-1 my-0.5 pointer-events-none" aria-hidden />
                  )}

                  {/* End-of-category drop zone: onDragEnter preventDefault required for Firefox drop */}
                  <div
                    onDragOver={(e) => handleCategoryEndDragOver(e, categoryId)}
                    onDragEnter={(e) => e.preventDefault()}
                    onDrop={(e) => handleCategoryEndDrop(e, categoryId, displayName)}
                    className="min-h-[8px] -mx-1 rounded-lg transition-colors"
                    aria-hidden
                  />

                  {/* Add item row at bottom of category */}
                  <button
                    type="button"
                    onClick={() => addItemToGroup(categoryId, displayName)}
                    className="w-full flex items-center gap-1.5 px-1 py-1 pl-[26px] text-[11px] text-gray-400 hover:text-[#EA000B] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#EA000B] rounded-lg transition-colors duration-150 -mt-0.5"
                  >
                    <Plus className="w-3 h-3 shrink-0" aria-hidden />
                    Add item
                  </button>

                </div>
              );
            })}

            {/* ── Global "Add category" at the very bottom ── */}
            <button
              type="button"
              onClick={addCategory}
              className="w-full flex items-center justify-center gap-1.5 h-9 border border-dashed border-gray-200 rounded-lg text-[11px] text-gray-400 hover:text-[#EA000B] hover:border-[#EA000B]/40 hover:bg-red-50/20 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#EA000B] transition-colors duration-150 mt-2"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden />
              Add category
            </button>

          </div>
        )}
      </div>
    </div>
  );
}

export { newItem as newMenuEditorItem };
