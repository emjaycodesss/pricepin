/**
 * Convert an image File to WebP in the browser for smaller uploads and faster loading.
 * Uses Canvas API; falls back to JPEG if WebP is not supported (rare).
 */

const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 0.85;

/**
 * Load a blob into an HTMLImageElement (resolve when onload).
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
 * Convert image file to WebP (or JPEG fallback). Resizes if larger than maxDimension.
 * Returns a new File so the original is unchanged.
 * @param maxDimension - Optional; defaults to MAX_DIMENSION (1920). Use lower (e.g. 1200) for menu photos.
 */
export async function fileToWebP(
  file: File,
  quality = WEBP_QUALITY,
  maxDimension = MAX_DIMENSION
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const img = await loadImage(file);
  const { width: w, height: h } = img;

  let width = w;
  let height = h;
  if (w > maxDimension || h > maxDimension) {
    if (w >= h) {
      width = maxDimension;
      height = Math.round((h * maxDimension) / w);
    } else {
      height = maxDimension;
      width = Math.round((w * maxDimension) / h);
    }
  }

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
