/**
 * Add Food Spot — route: /add-foodspot?lat=...&lng=...
 * Location comes from the main map (center pin). Form: name, address (from map), category, optional storefront photo.
 * No asterisks for required fields; optional photo explicitly labeled.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { reverseGeocode, searchAddress, type PhotonSuggestion } from '../lib/photon';
import { fileToWebP } from '../lib/imageToWebp';

const DEFAULT_LAT = 7.0731;
const DEFAULT_LNG = 125.6128;

/** Philippines-focused categories for the dropdown. */
const CATEGORIES = [
  'Fast Food',
  'Cafe / Coffee Shop',
  'Samgyupsal / Grill',
  'Carinderia / Budget Eats',
  'Restaurant (Casual/Fine Dining)',
  'Milk Tea / Desserts',
] as const;

/** Optional floor level for mall/multi-level venues (Location Directory). */
const FLOOR_LEVELS = [
  '',
  '1st Floor',
  '2nd Floor',
  '3rd Floor',
  '4th Floor',
  '5th Floor',
  'Basement',
  'Ground Floor',
] as const;

const STOREFRONT_BUCKET = 'storefronts';

/** Debounce delay (ms) for address autocomplete — matches main map SearchBar. */
const ADDRESS_DEBOUNCE_MS = 300;

/** Clear (X) icon for address field. */
function IconClear({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** Extension and Supabase content type from the file we actually upload (WebP, JPEG, or PNG). */
function getExtensionAndContentType(file: File): { ext: string; contentType: string } {
  const t = file.type.toLowerCase();
  if (t === 'image/webp') return { ext: '.webp', contentType: 'image/webp' };
  if (t === 'image/jpeg' || t === 'image/jpg') return { ext: '.jpg', contentType: 'image/jpeg' };
  if (t === 'image/png') return { ext: '.png', contentType: 'image/png' };
  const match = file.name.match(/\.(webp|jpe?g|png)$/i);
  if (match) {
    const ext = match[1].toLowerCase();
    if (ext === 'webp') return { ext: '.webp', contentType: 'image/webp' };
    if (ext === 'jpg' || ext === 'jpeg') return { ext: '.jpg', contentType: 'image/jpeg' };
    if (ext === 'png') return { ext: '.png', contentType: 'image/png' };
  }
  return { ext: '.webp', contentType: 'image/webp' };
}

export function AddFoodSpot() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const locationState = location.state as {
    returnSpotId?: string;
    address?: string;
    /** When returning from Update Menu, pre-fill form so user's data is preserved. */
    addSpotForm?: { name: string; address: string; category: string; floorLevel: string };
  } | null;
  const returnSpotId = locationState?.returnSpotId;
  /** When coming from Map Hub, center-pin address is passed for form pre-fill (data submission). */
  const passedAddress = locationState?.address ?? '';
  /** Pre-fill from spot when navigating back from Update Menu (Back to Add Food Spot). */
  const addSpotForm = locationState?.addSpotForm;
  const initialLat = searchParams.get('lat');
  const initialLng = searchParams.get('lng');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const floorLevelDropdownRef = useRef<HTMLDivElement>(null);
  const addressSectionRef = useRef<HTMLDivElement>(null);
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [floorLevelOpen, setFloorLevelOpen] = useState(false);
  /** Address autocomplete suggestions from Photon; only show dropdown when user is typing (input focused + suggestions). */
  const [addressSuggestions, setAddressSuggestions] = useState<PhotonSuggestion[]>([]);
  const [addressInputFocused, setAddressInputFocused] = useState(false);
  const [addressSuggestionsLoading, setAddressSuggestionsLoading] = useState(false);
  /** Dropdown visible only when user has focused the field and we have suggestions (autocomplete style). */
  const showAddressDropdown = addressInputFocused && addressSuggestions.length > 0;

  const latNum = initialLat ? parseFloat(initialLat) : DEFAULT_LAT;
  const lngNum = initialLng ? parseFloat(initialLng) : DEFAULT_LNG;
  const validLat = !Number.isNaN(latNum);
  const validLng = !Number.isNaN(lngNum);
  const initialLatVal = validLat ? latNum : DEFAULT_LAT;
  const initialLngVal = validLng ? lngNum : DEFAULT_LNG;

  /** Synced with map pin: from URL on load; updated when user edits address and we forward-geocode. Used for submit and for passing center back to map. */
  const [pinLat, setPinLat] = useState(initialLatVal);
  const [pinLng, setPinLng] = useState(initialLngVal);
  const lat = pinLat;
  const lng = pinLng;

  const [address, setAddress] = useState(addSpotForm?.address ?? passedAddress);
  const [addressLoading, setAddressLoading] = useState(false);
  /** Shown under address field when forward geocode finds no result (pin not moved). */
  const [addressGeocodeError, setAddressGeocodeError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [name, setName] = useState(addSpotForm?.name ?? '');
  const [category, setCategory] = useState<string>(addSpotForm?.category ?? '');
  const [floorLevel, setFloorLevel] = useState<string>(addSpotForm?.floorLevel ?? '');
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Start false so first paint is hidden; then transition in (avoids animation not visible on nav). */
  const [pageVisible, setPageVisible] = useState(false);

  /** Sync pin coordinates from URL when search params change (e.g. initial load). */
  useEffect(() => {
    const latParam = searchParams.get('lat');
    const lngParam = searchParams.get('lng');
    const parsedLat = latParam ? parseFloat(latParam) : null;
    const parsedLng = lngParam ? parseFloat(lngParam) : null;
    if (parsedLat != null && !Number.isNaN(parsedLat)) setPinLat(parsedLat);
    if (parsedLng != null && !Number.isNaN(parsedLng)) setPinLng(parsedLng);
  }, [searchParams]);

  /** Trigger page-enter transition on next frame so initial state is painted first. */
  useEffect(() => {
    const id = requestAnimationFrame(() => setPageVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /**
   * Reverse geocode the pinned map location to show human-readable address.
   * Skip when returning from Update Menu so we don't overwrite the saved address.
   * When Photon returns null (e.g. remote area, sea), use lat,lng as fallback so the field is never "location not found".
   */
  useEffect(() => {
    if (addSpotForm) {
      setAddressLoading(false);
      return;
    }
    let cancelled = false;
    setAddressLoading(true);
    reverseGeocode(lat, lng)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setAddress(result);
        } else {
          /* No result from Photon (e.g. remote coords); fallback to coordinates only when we have no address yet (e.g. no passedAddress). */
          setAddress((prev) => (prev.trim() ? prev : `${lat.toFixed(5)}, ${lng.toFixed(5)}`));
        }
      })
      .finally(() => {
        if (!cancelled) setAddressLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng, addSpotForm]);

  /**
   * Debounced address autocomplete: when user types, fetch Photon suggestions.
   * Dropdown is shown only when input is focused (see showAddressDropdown) so it behaves as autocomplete.
   */
  useEffect(() => {
    const trimmed = address.trim();
    if (!trimmed) {
      setAddressSuggestions([]);
      return;
    }
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    addressDebounceRef.current = setTimeout(async () => {
      setAddressSuggestionsLoading(true);
      try {
        const list = await searchAddress(trimmed, { lat: pinLat, lon: pinLng });
        setAddressSuggestions(list);
      } catch {
        setAddressSuggestions([]);
      } finally {
        setAddressSuggestionsLoading(false);
      }
    }, ADDRESS_DEBOUNCE_MS);
    return () => {
      if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    };
  }, [address, pinLat, pinLng]);

  /** Apply address + pin only when user explicitly picks a suggestion (same as main map SearchBar select). */
  const handleAddressSuggestionSelect = useCallback(
    (s: PhotonSuggestion) => {
      setAddressSuggestions([]);
      setAddressInputFocused(false);
      setAddress(s.displayName);
      setPinLat(s.lat);
      setPinLng(s.lng);
      setAddressGeocodeError(null);
      navigate(`/add-foodspot?lat=${s.lat}&lng=${s.lng}`, { replace: true });
    },
    [navigate]
  );

  /** Enter key: select first suggestion (same as main map SearchBar). */
  const handleAddressKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return;
      if (showAddressDropdown && addressSuggestions.length > 0) {
        e.preventDefault();
        handleAddressSuggestionSelect(addressSuggestions[0]);
      }
    },
    [showAddressDropdown, addressSuggestions, handleAddressSuggestionSelect]
  );

  /**
   * Forward geocode address text via Photon (Philippines bbox); update pin coords and URL, or set "Location not found".
   * Called on address blur and before Continue to add menu.
   */
  const syncAddressToPin = useCallback(async (): Promise<boolean> => {
    const trimmed = address.trim();
    if (!trimmed) {
      setAddressGeocodeError(null);
      return true;
    }
    setGeocoding(true);
    setAddressGeocodeError(null);
    try {
      const results = await searchAddress(trimmed);
      const first = results[0];
      if (first) {
        setPinLat(first.lat);
        setPinLng(first.lng);
        navigate(`/add-foodspot?lat=${first.lat}&lng=${first.lng}`, { replace: true });
        return true;
      }
      setAddressGeocodeError('No match found for this address; you can keep it and submit, or pick from the suggestions.');
      return false;
    } catch {
      setAddressGeocodeError('Lookup failed. You can keep this address and submit, or try picking from the suggestions.');
      return false;
    } finally {
      setGeocoding(false);
    }
  }, [address, navigate]);

  const photoPreviewsRef = useRef<string[]>([]);
  photoPreviewsRef.current = photoPreviews;
  /** Revoke object URLs on unmount only. */
  useEffect(() => {
    return () => {
      photoPreviewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  /** Close category, floor level, and address dropdowns when clicking outside. */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(target)) {
        setCategoryOpen(false);
      }
      if (floorLevelDropdownRef.current && !floorLevelDropdownRef.current.contains(target)) {
        setFloorLevelOpen(false);
      }
      if (addressSectionRef.current && !addressSectionRef.current.contains(target)) {
        setAddressInputFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /** Append image files (from input or drag-and-drop from OS). */
  const appendPhotoFiles = (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setPhotoFiles((prev) => [...prev, ...images]);
    setPhotoPreviews((prev) => [...prev, ...images.map((f) => URL.createObjectURL(f))]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    appendPhotoFiles(files);
  };

  /** Handle files dropped from OS (e.g. desktop/folder) onto the photo zone. */
  const handlePhotoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files ?? []);
    appendPhotoFiles(files);
  };

  const handlePhotoDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) e.dataTransfer.dropEffect = 'copy';
  };

  const handleRemovePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviews[index]);
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearAllPhotos = () => {
    photoPreviews.forEach((url) => URL.revokeObjectURL(url));
    setPhotoFiles([]);
    setPhotoPreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** Reorder photos: move item at fromIndex to toIndex (both arrays stay in sync). */
  const handleReorderPhotos = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setPhotoFiles((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
    setPhotoPreviews((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    const trimmedCategory = category.trim();

    if (!trimmedName) {
      setError('Please enter a restaurant name.');
      return;
    }
    if (!trimmedAddress) {
      setError('Please enter an address.');
      return;
    }
    if (!trimmedCategory) {
      setError('Please select a category.');
      return;
    }

    /** Sync typed address to pin (forward geocode) so pin matches what user typed before we submit. */
    await syncAddressToPin();

    setLoading(true);
    setError(null);

    if (returnSpotId) {
      navigate(`/update-menu/${returnSpotId}`, { replace: true });
      setLoading(false);
      return;
    }

    const storefrontUrls: string[] = [];
    const uploadErrors: string[] = [];

    try {
      for (const file of photoFiles) {
        let fileToUpload: File;
        try {
          fileToUpload = await fileToWebP(file);
        } catch {
          fileToUpload = file;
        }
        const { ext, contentType } = getExtensionAndContentType(fileToUpload);
        const path = `${crypto.randomUUID()}${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from(STOREFRONT_BUCKET)
          .upload(path, fileToUpload, { contentType, upsert: false });
        if (uploadErr) {
          uploadErrors.push(fileToUpload.name || 'image');
          continue;
        }
        const { data: urlData } = supabase.storage.from(STOREFRONT_BUCKET).getPublicUrl(path);
        storefrontUrls.push(urlData.publicUrl);
      }
      if (uploadErrors.length > 0) {
        setError(`Some photos could not be uploaded (${uploadErrors.join(', ')}). Check that the "storefronts" bucket exists and allows uploads.`);
        setLoading(false);
        return;
      }

      const { data, error: rpcError } = await supabase.rpc('create_restaurant', {
        p_name: trimmedName,
        p_address: trimmedAddress,
        p_lat: lat,
        p_lng: lng,
        p_category: trimmedCategory,
        p_storefront_image_urls: storefrontUrls,
        p_floor_level: floorLevel.trim() || null,
      });

      if (rpcError) throw rpcError;
      if (data != null) {
        const newSpotId = typeof data === 'string' ? data : (data as { id?: string })?.id ?? String(data);
        await queryClient.invalidateQueries({ queryKey: ['food_spots'] });
        await queryClient.refetchQueries({ queryKey: ['food_spots'] });
        navigate(`/update-menu/${newSpotId}`, {
          state: { fromAddSpot: true, addSpotLat: lat, addSpotLng: lng },
        });
        return;
      }
      throw new Error('No ID returned');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create restaurant. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 transition-colors duration-150 focus:border-[#EA000B] focus:outline-none';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

  return (
    <div
      className={`min-h-screen overflow-x-hidden transition-all duration-300 ease-out ${
        pageVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
      style={{
        backgroundColor: '#f9fafb',
        backgroundImage: `
          radial-gradient(ellipse 70% 50% at 100% 0%, rgba(234, 0, 11, 0.04) 0%, transparent 60%)
        `,
      }}
    >
      {/* Header: back + title, brand-aligned */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <Link
          to="/"
          state={{ center: [lat, lng] as [number, number] }}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EA000B]"
          aria-label="Back to map"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-lg font-semibold text-gray-900">Add Food Spot</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 w-full min-w-0">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <section className="rounded-2xl bg-white p-4">
            <label htmlFor="name" className={labelClass}>
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jollibee"
              className={inputClass}
              required
              autoFocus
              disabled={loading}
              autoComplete="organization"
            />
          </section>

          {/* Address: editable field; type to see suggestions, pick from dropdown to set location (same as main map SearchBar). */}
          <section className="rounded-2xl bg-white p-4 relative" ref={addressSectionRef}>
            <label htmlFor="address" className={labelClass}>
              Address
            </label>
            <p className="mb-2 text-xs text-gray-500">Editable. Type to search; pick a suggestion to set the location.</p>
            <div className="relative flex flex-col">
              <div className="flex items-center rounded-xl border border-gray-200 bg-white focus-within:border-[#EA000B] focus-within:ring-2 focus-within:ring-[#EA000B]/20 transition-colors duration-150 min-h-[48px]">
                <input
                  id="address"
                  type="text"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setAddressGeocodeError(null);
                  }}
                  onBlur={() => setAddressInputFocused(false)}
                  onFocus={() => setAddressInputFocused(true)}
                  onKeyDown={handleAddressKeyDown}
                  placeholder={addressLoading ? 'Loading address…' : 'Street, barangay, city'}
                  className={`flex-1 min-w-0 border-0 bg-transparent px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 ${address.trim() ? 'rounded-l-xl' : 'rounded-xl'}`}
                  required
                  disabled={loading}
                  autoComplete="off"
                  aria-label="Address"
                  aria-autocomplete="list"
                  aria-expanded={showAddressDropdown}
                  aria-controls="address-suggestions"
                />
                {address.trim() ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAddress('');
                      setAddressGeocodeError(null);
                      setAddressSuggestions([]);
                      setAddressInputFocused(false);
                    }}
                    className="flex items-center justify-center w-10 h-9 shrink-0 rounded-r-xl text-gray-500 hover:text-gray-800 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#EA000B] transition-colors"
                    aria-label="Clear address"
                  >
                    <IconClear />
                  </button>
                ) : null}
              </div>
              {showAddressDropdown && (
                <ul
                  id="address-suggestions"
                  className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto"
                  role="listbox"
                >
                  {addressSuggestions.map((s, i) => (
                    <li
                      key={`${s.lat}-${s.lng}-${i}`}
                      role="option"
                      tabIndex={0}
                      className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleAddressSuggestionSelect(s);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleAddressSuggestionSelect(s);
                        }
                      }}
                    >
                      {s.displayName}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {addressLoading && (
              <p className="mt-1.5 text-xs text-gray-500">Loading address…</p>
            )}
            {addressSuggestionsLoading && (
              <p className="mt-1.5 text-xs text-gray-500">Searching addresses…</p>
            )}
            {geocoding && (
              <p className="mt-1.5 text-xs text-gray-500">Looking up location…</p>
            )}
            {addressGeocodeError && (
              <p className="mt-1.5 text-xs text-red-600" role="alert">
                {addressGeocodeError}
              </p>
            )}
          </section>

          {/* Floor level — Optional; same custom dropdown as Category (design system). */}
          <section className="rounded-2xl bg-white p-4" ref={floorLevelDropdownRef}>
            <div className="flex items-baseline gap-2 mb-1.5">
              <label id="floor-level-label" className={labelClass + ' mb-0 shrink-0 inline-block text-sm leading-tight'}>
                Floor level
              </label>
              <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 leading-tight align-baseline">Optional</span>
            </div>
            <div className="relative mt-2">
              <button
                type="button"
                id="floor-level"
                aria-haspopup="listbox"
                aria-expanded={floorLevelOpen}
                aria-labelledby="floor-level-label"
                onClick={() => setFloorLevelOpen((o) => !o)}
                disabled={loading}
                className={
                  'w-full rounded-lg border bg-white px-4 py-3 text-left text-gray-900 transition-colors flex items-center justify-between gap-2 ' +
                  (floorLevelOpen
                    ? 'border-[#EA000B]'
                    : 'border-gray-200 hover:border-gray-300')
                }
              >
                <span className={floorLevel ? 'text-gray-900' : 'text-gray-400'}>
                  {floorLevel || 'Not specified'}
                </span>
                <svg
                  className={`h-5 w-5 shrink-0 text-gray-500 transition-transform ${floorLevelOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {floorLevelOpen && (
                <ul
                  role="listbox"
                  aria-labelledby="floor-level-label"
                  className="absolute z-20 left-0 right-0 top-full mt-1 max-h-56 overflow-auto rounded-lg border border-gray-100 bg-white shadow-lg"
                >
                  {FLOOR_LEVELS.map((opt) => (
                    <li
                      key={opt || 'none'}
                      role="option"
                      aria-selected={floorLevel === opt}
                      className="cursor-pointer px-4 py-2.5 text-sm text-gray-900 hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg"
                      onClick={() => {
                        setFloorLevel(opt);
                        setFloorLevelOpen(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setFloorLevel(opt);
                          setFloorLevelOpen(false);
                        }
                      }}
                    >
                      {opt || 'Not specified'}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Category — custom dropdown styled like SearchBar suggestions */}
          <section className="rounded-2xl bg-white p-4" ref={categoryDropdownRef}>
            <label id="category-label" className={labelClass}>
              Category
            </label>
            <div className="relative">
              <button
                type="button"
                id="category"
                aria-haspopup="listbox"
                aria-expanded={categoryOpen}
                aria-labelledby="category-label"
                onClick={() => setCategoryOpen((o) => !o)}
                disabled={loading}
                className={
                  'w-full rounded-lg border bg-white px-4 py-3 text-left text-gray-900 transition-colors flex items-center justify-between gap-2 ' +
                  (categoryOpen
                    ? 'border-[#EA000B]'
                    : 'border-gray-200 hover:border-gray-300')
                }
              >
                <span className={category ? 'text-gray-900' : 'text-gray-400'}>
                  {category || 'Select category'}
                </span>
                <svg
                  className={`h-5 w-5 shrink-0 text-gray-500 transition-transform ${categoryOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {categoryOpen && (
                <ul
                  role="listbox"
                  aria-labelledby="category-label"
                  className="absolute z-20 left-0 right-0 top-full mt-1 max-h-56 overflow-auto rounded-lg border border-gray-100 bg-white shadow-lg"
                >
                  {CATEGORIES.map((cat) => (
                    <li
                      key={cat}
                      role="option"
                      aria-selected={category === cat}
                      className="cursor-pointer px-4 py-2.5 text-sm text-gray-900 hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg"
                      onClick={() => {
                        setCategory(cat);
                        setCategoryOpen(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setCategory(cat);
                          setCategoryOpen(false);
                        }
                      }}
                    >
                      {cat}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Photo(s) — Optional, multiple allowed */}
          <section className="rounded-2xl bg-white p-4">
            <div className="flex items-baseline gap-2 mb-1.5">
              <label htmlFor="photo" className={labelClass + ' mb-0 shrink-0 inline-block text-sm leading-tight'}>
                {photoFiles.length === 1 ? 'Photo' : 'Photos'}
              </label>
              <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 leading-tight align-baseline">Optional</span>
            </div>
            <p className="mb-3 text-xs text-gray-500">A snap of the storefront so people recognize it on the map.</p>

            {photoPreviews.length === 0 ? (
              <label
                className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/80 text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-50 focus-within:border-[#EA000B] focus-within:outline-none"
                onDragOver={handlePhotoDragOver}
                onDrop={handlePhotoDrop}
              >
                <input
                  ref={fileInputRef}
                  id="photo"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={handlePhotoChange}
                  className="sr-only"
                  disabled={loading}
                />
                <svg className="mb-2 h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                </svg>
                <span className="text-sm">Click/drag photos to upload here</span>
              </label>
            ) : (
              <div className="space-y-3" onDragOver={handlePhotoDragOver} onDrop={handlePhotoDrop}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {photoPreviews.map((src, index) => (
                    <div
                      key={index}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', String(index));
                        e.dataTransfer.effectAllowed = 'move';
                        e.currentTarget.classList.add('opacity-60');
                      }}
                      onDragEnd={(e) => e.currentTarget.classList.remove('opacity-60')}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.dataTransfer.files?.length) {
                          appendPhotoFiles(Array.from(e.dataTransfer.files));
                          return;
                        }
                        const from = Number(e.dataTransfer.getData('text/plain'));
                        if (Number.isNaN(from) || from === index) return;
                        handleReorderPhotos(from, index);
                      }}
                      className="relative aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 cursor-grab active:cursor-grabbing transition-opacity"
                    >
                      <img src={src} alt={`Storefront ${index + 1}`} className="w-full h-full object-cover pointer-events-none" draggable={false} />
                      <span className="absolute left-1.5 top-1.5 rounded bg-black/50 p-1 text-white pointer-events-none" aria-hidden>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M8 6h8M8 12h8M8 18h8" />
                        </svg>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(index)}
                        className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
                        aria-label={`Remove photo ${index + 1}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer text-sm text-gray-600 hover:text-gray-900 focus-within:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#EA000B] focus-visible:outline-offset-1 rounded px-2 py-1">
                    <input
                      ref={fileInputRef}
                      id="photo-more"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handlePhotoChange}
                      className="sr-only"
                      disabled={loading}
                    />
                    Add more
                  </label>
                  <button
                    type="button"
                    onClick={handleClearAllPhotos}
                    className="text-sm text-gray-500 hover:text-red-600 transition-colors"
                  >
                    Clear all
                  </button>
                </div>
              </div>
            )}
          </section>

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] rounded-xl bg-[#EA000B] px-4 py-3 font-semibold text-white shadow-md transition-colors hover:bg-[#c20009] disabled:opacity-50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {loading ? 'Creating…' : 'Continue to add menu'}
          </button>
        </form>
      </main>
    </div>
  );
}
