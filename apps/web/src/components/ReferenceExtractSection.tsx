/**
 * Reference & Extract: multi-upload (up to 5), gallery thumbnails, active zoomable view, "Scan this Image".
 * Replaces single-photo MediaInputSection for Update Menu.
 * When VITE_TURNSTILE_SITE_KEY is set, shows Cloudflare Turnstile and sends token with OCR request.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { processMenu, type ParsedMenuItem } from '../lib/api';
import { fileToWebP, compressMenuPhoto } from '../lib/imageToWebp';
import { uploadMenuPhoto } from '../lib/menuPhotoUpload';
import { saveMenuUpdateRow } from '../lib/menuPhotoUpload';

const MAX_IMAGES = 5;

/** Public Turnstile site key (same widget as TURNSTILE_SECRET on API). When set, widget is shown and token sent. */
const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim();

export interface MenuImageSlot {
  id: string;
  file: File;
  objectUrl: string;
  publicUrl?: string;
  fileName?: string;
  /** menu_updates.id for this photo (used to link extracted items to their source image). */
  menuUpdateId?: string | null;
  uploading?: boolean;
}

interface ReferenceExtractSectionProps {
  /** Called with OCR items for the active image, plus the menu_update_id for that image (if available). */
  onOcrResult: (items: ParsedMenuItem[], menuUpdateId?: string | null) => void;
  spotId?: string | null;
  spotName?: string | null;
}

/** Trash icon for remove. */
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

export function ReferenceExtractSection({
  onOcrResult,
  spotId,
  spotName,
}: ReferenceExtractSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const [slots, setSlots] = useState<MenuImageSlot[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** When Turnstile fails (e.g. 110200, blocked), we hide the widget and allow scan without token. */
  const [turnstileUnavailable, setTurnstileUnavailable] = useState(false);

  /** When photo count changes, allow Turnstile to be shown again (retry after widget error). */
  const prevSlotsLen = useRef(slots.length);
  useEffect(() => {
    if (slots.length !== prevSlotsLen.current) {
      prevSlotsLen.current = slots.length;
      setTurnstileUnavailable(false);
    }
  }, [slots.length]);

  /** Render Turnstile widget when we have site key and at least one slot. Script loads async from index.html. */
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || slots.length === 0 || !turnstileContainerRef.current || turnstileUnavailable) return;
    const render = () => {
      if (!window.turnstile || !turnstileContainerRef.current) return;
      if (turnstileWidgetIdRef.current != null) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
      try {
        turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          size: 'normal',
          'error-callback': () => setTurnstileUnavailable(true),
        } as Parameters<NonNullable<typeof window.turnstile>['render']>[1]);
      } catch {
        setTurnstileUnavailable(true);
      }
    };
    if (window.turnstile) {
      render();
    } else {
      const t = setInterval(() => {
        if (window.turnstile) {
          clearInterval(t);
          render();
        }
      }, 100);
      return () => {
        clearInterval(t);
        if (turnstileWidgetIdRef.current != null && window.turnstile) {
          window.turnstile.remove(turnstileWidgetIdRef.current);
          turnstileWidgetIdRef.current = null;
        }
      };
    }
    return () => {
      if (turnstileWidgetIdRef.current != null && window.turnstile) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [slots.length, turnstileUnavailable]);

  /** Clamp activeIndex when slots change. */
  useEffect(() => {
    if (slots.length === 0) setActiveIndex(0);
    else if (activeIndex >= slots.length) setActiveIndex(slots.length - 1);
  }, [slots.length, activeIndex]);

  const slotsRef = useRef<MenuImageSlot[]>([]);
  slotsRef.current = slots;
  /** Revoke object URLs on unmount only. */
  useEffect(() => {
    return () => {
      slotsRef.current.forEach((s) => URL.revokeObjectURL(s.objectUrl));
    };
  }, []);

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const remaining = MAX_IMAGES - slots.length;
      if (remaining <= 0) return;
      const toAdd = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, remaining);
      const newSlots: MenuImageSlot[] = toAdd.map((file) => ({
        id: crypto.randomUUID(),
        file,
        objectUrl: URL.createObjectURL(file),
        menuUpdateId: null,
        uploading: false,
      }));
      setSlots((prev) => [...prev, ...newSlots]);
      setOcrError(null);
      setUploadError(null);
      if (slots.length === 0) setActiveIndex(0);

      /** Upload + create menu_updates row per image when spotId is provided. One batch_id per add so admin verify shows all these photos together. */
      if (spotId) {
        const batchId = crypto.randomUUID();
        for (let i = 0; i < newSlots.length; i++) {
          const slot = newSlots[i];
          setSlots((prev) =>
            prev.map((s) => (s.id === slot.id ? { ...s, uploading: true } : s))
          );
          try {
            const compressed = await compressMenuPhoto(slot.file);
            const result = await uploadMenuPhoto(compressed, spotName ?? undefined);
            const source =
              slot.file.name.toLowerCase().startsWith('image.') || /^img[_\-]/i.test(slot.file.name)
                ? ('capture' as const)
                : ('upload' as const);
            const menuUpdateId = await saveMenuUpdateRow({
              foodSpotId: spotId,
              menuPhotoUrl: result.publicUrl,
              fileName: result.fileName,
              fileSizeBytes: result.fileSizeBytes,
              source,
              batchId,
            });
            setSlots((prev) =>
              prev.map((s) =>
                s.id === slot.id
                  ? { ...s, publicUrl: result.publicUrl, fileName: result.fileName, uploading: false, menuUpdateId }
                  : s
              )
            );
          } catch (err) {
            setUploadError(err instanceof Error ? err.message : 'Upload failed');
            setSlots((prev) =>
              prev.map((s) => (s.id === slot.id ? { ...s, uploading: false } : s))
            );
          }
        }
      }
    },
    [slots.length, spotId, spotName]
  );

  const removeSlot = useCallback((id: string) => {
    setSlots((prev) => {
      const next = prev.filter((s) => s.id !== id);
      const revoked = prev.find((s) => s.id === id);
      if (revoked) URL.revokeObjectURL(revoked.objectUrl);
      return next;
    });
    setOcrError(null);
  }, []);

  const handleScanThisImage = useCallback(async () => {
    const slot = slots[activeIndex];
    if (!slot) {
      setOcrError('Select an image first.');
      return;
    }
    if (slot.uploading) {
      setOcrError('Please wait for the photo to finish uploading.');
      return;
    }
    if (spotId && !slot.menuUpdateId) {
      setOcrError('Photo is not linked yet. Please wait a moment and try again.');
      return;
    }
    // If Turnstile widget loaded and has a token, we send it; if widget failed (e.g. 110200, blocked), we send without token and API still allows the request.
    setOcrLoading(true);
    setOcrError(null);
    try {
      const webpFile = await fileToWebP(slot.file);
      const form = new FormData();
      form.append('file', webpFile);
      if (TURNSTILE_SITE_KEY && turnstileWidgetIdRef.current != null && window.turnstile) {
        const token = window.turnstile.getResponse(turnstileWidgetIdRef.current);
        if (token) form.append('turnstile_token', token);
      }
      const res = await processMenu(form);
      onOcrResult(res.items ?? [], slot.menuUpdateId ?? null);
      if (TURNSTILE_SITE_KEY && turnstileWidgetIdRef.current != null && window.turnstile) {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message === 'Failed to fetch'
          ? 'API not reachable. Start the backend or add items manually.'
          : err instanceof Error
            ? err.message
            : 'OCR failed. Add items manually.';
      setOcrError(message);
    } finally {
      setOcrLoading(false);
    }
  }, [slots, activeIndex, onOcrResult, spotId]);

  const activeSlot = slots[activeIndex];
  const canAddMore = slots.length < MAX_IMAGES;

  return (
    <div className="flex flex-col h-auto min-h-0 min-w-0 tablet:h-full">
      <h2 className="text-sm font-semibold text-gray-800 mb-2 shrink-0">Menu photos</h2>

      {/* Multi-upload: up to 5 — reduced gap/margin to reclaim vertical space */}
      <div className="flex flex-col gap-1.5 mb-2 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => {
            addFiles(e.target.files ?? null);
            e.target.value = '';
          }}
          className="hidden"
          aria-label="Upload or capture menu images (up to 5)"
        />
        {canAddMore && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] w-full rounded-xl border border-dashed border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 text-sm font-medium transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EA000B] shrink-0"
          >
            Add photo ({slots.length}/{MAX_IMAGES})
          </button>
        )}
      </div>

      {/* Gallery thumbnails: 56×56 on mobile to reclaim space; min-w-0 so strip scrolls horizontally */}
      {slots.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto overflow-y-hidden pb-1.5 pt-1.5 pr-1.5 mb-2 min-w-0 shrink-0">
          {slots.map((slot, index) => (
            <div
              key={slot.id}
              className="relative shrink-0 group"
            >
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`block w-[56px] h-[56px] rounded-lg overflow-hidden border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EA000B] focus-visible:ring-offset-1 ${
                  index === activeIndex
                    ? 'border-[#EA000B] shadow-md'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                aria-pressed={index === activeIndex}
                aria-label={`Select image ${index + 1}`}
              >
                <img
                  src={slot.objectUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </button>
              {slot.uploading && (
                <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 text-white text-xs font-medium">
                  Linking…
                </span>
              )}
              <button
                type="button"
                onClick={() => removeSlot(slot.id)}
                className="absolute top-1 right-1 w-7 h-7 rounded-md bg-black/60 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 transition-all"
                aria-label={`Remove image ${index + 1}`}
              >
                <IconTrash className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Active view: flex-1 with min-h-[25vh] so image area stays usable; only the img wrapper scrolls (overflow-auto) */}
      {activeSlot && (
        <div className="flex-1 min-h-[25vh] flex flex-col rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
          <div className="flex items-center justify-between gap-2 p-1.5 bg-gray-100/80 shrink-0">
            <span className="text-xs font-medium text-gray-500">
              Image {activeIndex + 1} of {slots.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 flex items-center justify-center text-sm font-semibold"
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="text-xs text-gray-600 min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 flex items-center justify-center text-sm font-semibold"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
          </div>
          {/* Only this div (containing the zoom-transformed img) is scrollable */}
          <div className="flex-1 min-h-0 overflow-auto p-1.5">
            <div
              className="origin-top-left"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            >
              <img
                src={activeSlot.objectUrl}
                alt="Menu reference"
                className="max-w-full h-auto block"
                draggable={false}
                style={{ minWidth: '100%' }}
              />
            </div>
          </div>
        </div>
      )}

      {!activeSlot && slots.length === 0 && (
        <div className="flex-1 min-h-0 rounded-xl border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-sm font-medium text-gray-500">
          No photo yet. Add up to {MAX_IMAGES} images.
        </div>
      )}

      {/* Turnstile widget when site key is set and there are photos. If widget errors (e.g. 110200), show fallback so user can still scan. */}
      {activeSlot && TURNSTILE_SITE_KEY && (
        turnstileUnavailable ? (
          <p className="mt-2 text-xs text-gray-500 shrink-0">Verification unavailable. You can still scan.</p>
        ) : (
          <div ref={turnstileContainerRef} className="mt-2 flex justify-center shrink-0" aria-label="Verification" />
        )
      )}

      {/* Scan this Image — prominent CTA; shrink-0 so image viewer gets flex space above; reduced mt to reclaim space */}
      {activeSlot && (
        <button
          type="button"
          onClick={handleScanThisImage}
          disabled={ocrLoading || Boolean(activeSlot.uploading) || (Boolean(spotId) && !activeSlot.menuUpdateId)}
          className="mt-2 min-h-[48px] w-full rounded-xl bg-[#EA000B] text-white font-semibold hover:bg-[#c20009] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white transition-colors shrink-0"
        >
          {ocrLoading ? 'Scanning…' : activeSlot.uploading ? 'Linking photo…' : 'Scan this image'}
        </button>
      )}

      {(uploadError || ocrError) && (
        <p className="mt-1.5 text-sm text-red-600 shrink-0" role="alert">
          {uploadError ?? ocrError}
        </p>
      )}
    </div>
  );
}
