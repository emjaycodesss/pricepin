/**
 * Convert an image File to WebP in the browser for smaller uploads and faster loading.
 * Fast path: createImageBitmap (decode, often off main thread) then canvas draw + toBlob.
 * Fallback: classic Image() + canvas for older or unsupported cases.
 */

const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 0.85;

/**
 * Load a blob into an HTMLImageElement (resolve when onload). Fallback when createImageBitmap is not used.
 */
function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/**
 * Compute target width/height so the longer edge is at most maxDimension; aspect ratio preserved.
 */
function scaleToMaxDimension(
  w: number,
  h: number,
  maxDimension: number
): { width: number; height: number } {
  if (w <= maxDimension && h <= maxDimension) return { width: w, height: h };
  if (w >= h) {
    return { width: maxDimension, height: Math.round((h * maxDimension) / w) };
  }
  return { height: maxDimension, width: Math.round((w * maxDimension) / h) };
}

/**
 * Fast path: decode with createImageBitmap (can be faster than Image()), draw at target size, toBlob.
 * Reuses one canvas and avoids object URL. Caller must pass a File or Blob.
 */
async function compressWithImageBitmap(
  file: File,
  quality: number,
  maxDimension: number
): Promise<File | null> {
  if (typeof createImageBitmap === 'undefined') return null;
  try {
    const bitmap = await createImageBitmap(file);
    const { width: w, height: h } = bitmap;
    const { width, height } = scaleToMaxDimension(w, h, maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const mime = 'image/webp';
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mime, quality);
    });
    if (!blob) {
      const jpegBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', quality);
      });
      if (!jpegBlob) return null;
      const base = file.name.replace(/\.[^.]+$/, '');
      return new File([jpegBlob], `${base}.jpg`, { type: 'image/jpeg' });
    }
    const base = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.webp`, { type: mime });
  } catch {
    return null;
  }
}

/**
 * Convert image file to WebP (or JPEG fallback). Resizes if larger than maxDimension.
 * Prefers createImageBitmap when available for faster decode; falls back to Image() + canvas.
 */
export async function fileToWebP(
  file: File,
  quality = WEBP_QUALITY,
  maxDimension = MAX_DIMENSION
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const fast = await compressWithImageBitmap(file, quality, maxDimension);
  if (fast) return fast;

  const img = await loadImage(file);
  const { width: w, height: h } = img;
  const { width, height } = scaleToMaxDimension(w, h, maxDimension);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  const mime = 'image/webp';
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mime, quality);
  });

  if (!blob) {
    const jpegBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    if (!jpegBlob) return file;
    const base = file.name.replace(/\.[^.]+$/, '');
    return new File([jpegBlob], `${base}.jpg`, { type: 'image/jpeg' });
  }

  const base = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${base}.webp`, { type: mime });
}

/** Stricter compression for menu photos: 1200px max, 0.78 quality — saves storage and mobile data (e.g. Davao). */
export const MENU_PHOTO_MAX_DIMENSION = 1200;
export const MENU_PHOTO_QUALITY = 0.78;

export async function compressMenuPhoto(file: File): Promise<File> {
  return fileToWebP(file, MENU_PHOTO_QUALITY, MENU_PHOTO_MAX_DIMENSION);
}
