/**
 * Update Menu — route: /update-menu/:spotId.
 * Two-column split: left = upload/capture + OCR; right = menu items editor.
 * Finalize saves menu items to Supabase and navigates back to map (restaurant already on map).
 */
import { useState, useCallback } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ReferenceExtractSection } from '../components/ReferenceExtractSection';
import { MenuEditorSection, type MenuEditorItem } from '../components/MenuEditorSection';
import { saveMenuItems, canFinalizeMenu } from '../lib/menu';
import { useFoodSpots } from '../hooks/useFoodSpots';
import { supabase } from '../lib/supabase';
import type { ParsedMenuItem } from '../lib/api';
import type { FoodSpotWithCoords } from '../hooks/useFoodSpots';

function parsedToEditorItems(items: ParsedMenuItem[], menuUpdateId?: string | null): MenuEditorItem[] {
  return items.map((item) => ({
    id: crypto.randomUUID(),
    category: item.category ?? '',
    item_name: item.item_name ?? '',
    variant: item.variant_name ?? '',
    price: item.price != null ? String(item.price) : '',
    description: item.description ?? '',
    menu_update_id: menuUpdateId ?? null,
  }));
}

/** Checkmark for success. */
function IconCheck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function UpdateMenu() {
  const { spotId } = useParams<{ spotId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: foodSpots } = useFoodSpots();
  /** Spot from the main list (may be stale when we just navigated from Add Food Spot). */
  const spotFromList = spotId ? foodSpots.find((s) => s.id === spotId) : null;
  /** When list doesn't have the spot yet (e.g. just created), fetch this one by id so the page can display. */
  const { data: singleSpot, isLoading: singleSpotLoading } = useQuery({
    queryKey: ['food_spot', spotId ?? ''],
    queryFn: async (): Promise<FoodSpotWithCoords | null> => {
      if (!spotId || spotId === 'new') return null;
      const { data, error } = await supabase
        .from('food_spots_with_coords')
        .select('id, name, address, category, storefront_image_urls, floor_level, is_vat_inclusive, service_charge_percent, created_at, lat, lng, starting_meal_price, is_permanently_closed')
        .eq('id', spotId)
        .maybeSingle();
      if (error) throw error;
      if (!data || (data as { is_permanently_closed?: boolean }).is_permanently_closed) return null;
      return data as unknown as FoodSpotWithCoords;
    },
    enabled: Boolean(spotId && spotId !== 'new' && !spotFromList),
    staleTime: 60 * 1000,
  });
  /** Use list first; fall back to single-spot fetch when coming from Add Food Spot before list has refetched. */
  const spot = spotFromList ?? singleSpot ?? null;
  const spotName = spot?.name ?? null;

  const fromAddSpot = (location.state as { fromAddSpot?: boolean; addSpotLat?: number; addSpotLng?: number } | null)?.fromAddSpot;
  const addSpotLat = (location.state as { addSpotLat?: number } | null)?.addSpotLat;
  const addSpotLng = (location.state as { addSpotLng?: number } | null)?.addSpotLng;
  const backToAddSpotUrl = addSpotLat != null && addSpotLng != null
    ? `/add-foodspot?lat=${addSpotLat}&lng=${addSpotLng}`
    : '/add-foodspot';
  /** Pass spot details when going back to Add Food Spot so the form is pre-filled (persists user's data). */
  const backToAddSpotState =
    fromAddSpot && spotId && spot
      ? {
          returnSpotId: spotId,
          addSpotForm: {
            name: spot.name ?? '',
            address: spot.address ?? '',
            category: spot.category ?? '',
            floorLevel: spot.floor_level ?? '',
          },
        }
      : fromAddSpot && spotId
        ? { returnSpotId: spotId }
        : undefined;
  const [menuItems, setMenuItems] = useState<MenuEditorItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [finalizeSuccess, setFinalizeSuccess] = useState(false);

  /** First scan populates the list; subsequent scans append to the bottom. */
  const handleOcrResult = useCallback((items: ParsedMenuItem[], menuUpdateId?: string | null) => {
    const editorItems = parsedToEditorItems(items, menuUpdateId);
    if (editorItems.length === 0) return;
    setMenuItems((prev) => {
      if (prev.length === 0) return editorItems;
      return [...prev, ...editorItems];
    });
  }, []);

  const handleFinalize = useCallback(async () => {
    if (!spotId || spotId === 'new') {
      setFinalizeError('No restaurant selected. Go back to the map and open Update Menu from a pin.');
      return;
    }
    if (!canFinalizeMenu(menuItems)) {
      setFinalizeError('Add at least one item with a name and price.');
      return;
    }
    setFinalizeError(null);
    setIsSaving(true);
    try {
      const result = await saveMenuItems(spotId, menuItems);
      if (!result.success) {
        setFinalizeError(result.error ?? 'Failed to save menu.');
        return;
      }
      setFinalizeSuccess(true);
      // Ensure map has fresh restaurant list (e.g. after first add), then navigate and focus pin
      await queryClient.invalidateQueries({ queryKey: ['food_spots'] });
      setTimeout(() => {
        navigate('/', { state: { focusSpotId: spotId } });
      }, 1200);
    } finally {
      setIsSaving(false);
    }
  }, [spotId, menuItems, navigate, queryClient]);

  const validRestaurant = Boolean(spotId && spotId !== 'new');
  const canSave = validRestaurant && canFinalizeMenu(menuItems) && !isSaving;
  /** Show loading when we have spotId but spot not in list yet (e.g. just created) and single-spot fetch in progress. */
  const spotLoading = Boolean(spotId && spotId !== 'new' && !spot && singleSpotLoading);

  return (
    <div
      className="h-full min-h-screen flex flex-col overflow-y-auto tablet:h-screen tablet:overflow-hidden tablet:min-h-0 bg-gray-100"
    >
      {/* Header: same as Add Food Spot — back arrow + title */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 shrink-0">
        <Link
          to={fromAddSpot ? backToAddSpotUrl : '/'}
          state={backToAddSpotState}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EA000B]"
          aria-label={fromAddSpot ? 'Back to Add Food Spot' : 'Back to map'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-lg font-semibold text-gray-900">
            {validRestaurant ? 'Update menu' : 'Add menu photo'}
          </h1>
        </div>
      </header>

      {/* Mobile: flex flex-col so sections stack and take their space; tablet: grid two-column. */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col tablet:grid tablet:grid-cols-2 tablet:grid-rows-[1fr] gap-3 p-3 tablet:gap-4 tablet:p-4 tablet:overflow-hidden">
        {spotLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 text-gray-500 py-8">
            <p className="text-sm font-medium">Loading restaurant…</p>
            <p className="text-xs">Preparing menu update</p>
          </div>
        ) : (
          <>
            {/* Menu photos: takes the space it needs on mobile; fixed height on tablet */}
            <section className="flex flex-col min-h-0 overflow-hidden rounded-2xl bg-white p-3 tablet:p-4 shrink-0 tablet:shrink tablet:min-h-0">
              <ReferenceExtractSection
                onOcrResult={handleOcrResult}
                spotId={spotId ?? null}
                spotName={spotName}
              />
            </section>
            {/* Menu items: min-h-[500px] on mobile so fully usable when scrolled to; tablet fills remaining */}
            <section className="flex flex-col min-h-[500px] tablet:min-h-0 overflow-hidden rounded-2xl bg-white p-3 tablet:p-4">
              <MenuEditorSection items={menuItems} onItemsChange={setMenuItems} />
            </section>
          </>
        )}
      </div>

      {/* Sticky footer: stays at bottom of viewport while content scrolls behind */}
      <footer className="sticky bottom-0 z-10 shrink-0 border-t border-gray-200 bg-white px-4 py-4 flex flex-col gap-3">
        {finalizeError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {finalizeError}
          </div>
        )}
        {finalizeSuccess && (
          <p className="text-sm text-green-700 flex items-center gap-2" role="status">
            <IconCheck className="shrink-0 text-green-600" />
            Menu saved. Taking you to the map…
          </p>
        )}
        {/* Reminder to verify prices before finalizing — only when user can submit and hasn't succeeded yet */}
        {canSave && !finalizeSuccess && (
          <p className="text-xs text-gray-500 flex items-center gap-2" role="note">
            <svg className="shrink-0 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            Verify names and prices before finalizing — they’ll be visible on the map.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to={fromAddSpot ? backToAddSpotUrl : '/'}
            state={backToAddSpotState}
            className="min-h-[44px] min-w-[120px] px-4 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EA000B] transition-colors inline-flex items-center justify-center"
          >
            {fromAddSpot ? 'Back to Add Food Spot' : 'Back to map'}
          </Link>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={!canSave}
            className="min-h-[44px] px-6 rounded-xl bg-[#EA000B] text-white text-sm font-semibold hover:bg-[#c20009] disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white transition-colors inline-flex items-center justify-center gap-2"
          >
            {isSaving ? (
              'Saving…'
            ) : finalizeSuccess ? (
              <>
                <IconCheck className="shrink-0" />
                Saved
              </>
            ) : (
              'Finalize menu'
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
