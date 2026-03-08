/**
 * Full-screen lightbox for gallery images with high-resolution zoom and pan.
 * Renders via portal into document.body so it covers map and sidebar on mobile/tablet.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface GalleryLightboxItem {
  url: string;
  /** e.g. "Uploaded Oct, 2024" */
  label: string;
}

interface GalleryLightboxProps {
  /** Full list of gallery items. */
  items: GalleryLightboxItem[];
  /** Current index to show; null or out of range = lightbox closed. */
  currentIndex: number | null;
  onClose: () => void;
  /** Called when user selects prev/next so parent can update currentIndex. */
  onIndexChange: (index: number) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

const SWIPE_THRESHOLD_PX = 50;

export function GalleryLightbox({ items, currentIndex, onClose, onIndexChange }: GalleryLightboxProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [fadeIn, setFadeIn] = useState(true);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const item =
    currentIndex != null && currentIndex >= 0 && currentIndex < items.length
      ? items[currentIndex]
      : null;
  const hasPrev = item && currentIndex != null && currentIndex > 0;
  const hasNext = item && currentIndex != null && currentIndex < items.length - 1;

  const resetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!item) {
      resetZoom();
      return;
    }
    resetZoom();
  }, [item, resetZoom]);

  /** Brief fade-in when changing image (e.g. after swipe). */
  useEffect(() => {
    if (!item) return;
    setFadeIn(true);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setFadeIn(false));
    });
    return () => cancelAnimationFrame(id);
  }, [currentIndex]);

  /** Touch swipe: left = next, right = prev. Only when not zoomed so it doesn’t conflict with pan. */
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (scale > 1 || items.length <= 1) return;
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY };
    },
    [scale, items.length]
  );
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (scale > 1 || items.length <= 1 || !touchStartRef.current) {
        touchStartRef.current = null;
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      touchStartRef.current = null;
      if (Math.abs(dx) < Math.abs(dy)) return;
      if (dx < -SWIPE_THRESHOLD_PX && hasNext) {
        onIndexChange(currentIndex! + 1);
      } else if (dx > SWIPE_THRESHOLD_PX && hasPrev) {
        onIndexChange(currentIndex! - 1);
      }
    },
    [scale, items.length, hasPrev, hasNext, currentIndex, onIndexChange]
  );

  /** Lock body scroll when lightbox is open (full-screen over map/sidebar on mobile). */
  useEffect(() => {
    if (!item) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [item]);

  /** Close on Escape; Left/Right for prev/next */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (!item) return;
      if (e.key === 'ArrowLeft' && hasPrev) {
        e.preventDefault();
        onIndexChange(currentIndex! - 1);
      }
      if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        onIndexChange(currentIndex! + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, hasPrev, hasNext, currentIndex, onClose, onIndexChange]);

  /** Prevent wheel from scrolling the page; use for zoom instead. */
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !item) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setScale((s) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s + delta)));
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [item]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  }, [scale, position]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: dragStart.current.posX + (e.clientX - dragStart.current.x),
        y: dragStart.current.posY + (e.clientY - dragStart.current.y),
      });
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(MAX_ZOOM, s + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => {
      const next = Math.max(MIN_ZOOM, s - ZOOM_STEP);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  }, []);

  if (!item) return null;

  const lightboxContent = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="Image lightbox"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        aria-label="Close lightbox"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Prev / Next — flank the image; hidden on mobile (use swipe instead) */}
      <div className="absolute inset-0 z-10 hidden tablet:flex items-center justify-center pointer-events-none">
        <div className="w-full max-w-[85vw] flex items-center justify-between pointer-events-auto">
          {hasPrev ? (
            <button
              type="button"
              onClick={() => onIndexChange(currentIndex! - 1)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Previous image"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          ) : (
            <div className="w-12 shrink-0" aria-hidden />
          )}
          {hasNext ? (
            <button
              type="button"
              onClick={() => onIndexChange(currentIndex! + 1)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Next image"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ) : (
            <div className="w-12 shrink-0" aria-hidden />
          )}
        </div>
      </div>

      {/* Uploaded label — corner */}
      <div className="absolute bottom-4 left-4 z-10 rounded-lg bg-black/60 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm">
        {item.label}
      </div>

      {/* Counter and zoom controls */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
        {items.length > 1 && (
          <span className="rounded-lg bg-black/60 px-2.5 py-1 text-xs text-white/90 backdrop-blur-sm">
            {currentIndex! + 1} / {items.length}
          </span>
        )}
        <div className="flex flex-col gap-1 rounded-lg bg-black/60 p-1 backdrop-blur-sm">
        <button
          type="button"
          onClick={handleZoomIn}
          className="flex h-9 w-9 items-center justify-center text-white hover:bg-white/20 rounded"
          aria-label="Zoom in"
        >
          <span className="text-lg font-semibold">+</span>
        </button>
        <span className="text-center text-xs text-white/90">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={handleZoomOut}
          className="flex h-9 w-9 items-center justify-center text-white hover:bg-white/20 rounded"
          aria-label="Zoom out"
        >
          <span className="text-lg font-semibold">−</span>
        </button>
        </div>
      </div>

      {/* Image container — pannable when zoomed; swipeable on mobile when not zoomed */}
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { touchStartRef.current = null; }}
      >
        <img
          key={currentIndex}
          src={item.url}
          alt=""
          className="max-w-full max-h-full object-contain select-none pointer-events-none transition-opacity duration-200 ease-out"
          style={{
            opacity: fadeIn ? 0 : 1,
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
          draggable={false}
        />
      </div>
    </div>
  );

  return createPortal(lightboxContent, document.body);
}
