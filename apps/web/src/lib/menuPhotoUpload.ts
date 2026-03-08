/**
 * Menu photo upload: unique naming (spot slug + timestamp), Supabase Storage, and optional menu_updates record.
 * Used by Update Menu flow — compress on client, upload to menu_photos bucket, then save URL to menu_updates.
 */

import { supabase } from './supabase';

export const MENU_PHOTOS_BUCKET = 'menu_photos';

/**
 * Slug from spot name for file naming: lowercase, replace non-alphanumeric with underscore, limit length.
 * e.g. "Jollibee Lanang" -> "jollibee_lanang"
 */
export function slugFromSpotName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return 'menu';
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64);
  return slug || 'menu';
}

/**
 * Unique file name: {slug}_{unix_timestamp}.webp to prevent conflicts.
 */
export function uniqueMenuPhotoFileName(spotName: string | null | undefined): string {
  const slug = slugFromSpotName(spotName);
  const ts = Math.floor(Date.now() / 1000);
  return `${slug}_${ts}.webp`;
}

export interface MenuPhotoUploadResult {
  publicUrl: string;
  fileName: string;
  fileSizeBytes: number;
  storagePath: string;
}

/**
 * Upload a menu photo file (already compressed) to Supabase Storage.
 * Returns public URL and metadata. Does not insert into menu_updates — caller does that.
 */
export async function uploadMenuPhoto(
  file: File,
  spotName: string | null | undefined
): Promise<MenuPhotoUploadResult> {
  const fileName = uniqueMenuPhotoFileName(spotName);
  const { data: urlData } = supabase.storage
    .from(MENU_PHOTOS_BUCKET)
    .getPublicUrl(fileName);

  const { error: uploadError } = await supabase.storage
    .from(MENU_PHOTOS_BUCKET)
    .upload(fileName, file, { contentType: 'image/webp', upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  return {
    publicUrl: urlData.publicUrl,
    fileName,
    fileSizeBytes: file.size,
    storagePath: fileName,
  };
}

export interface SaveMenuUpdateRowParams {
  foodSpotId: string;
  menuPhotoUrl: string;
  fileName: string;
  fileSizeBytes?: number;
  source?: 'upload' | 'capture';
  /** When uploading multiple photos in one session, pass same batchId for each so admin verify shows them together. */
  batchId?: string | null;
}

/**
 * Insert a row into menu_updates and return the new id.
 */
export async function saveMenuUpdateRow(params: SaveMenuUpdateRowParams): Promise<string> {
  const { data, error } = await supabase
    .from('menu_updates')
    .insert({
      food_spot_id: params.foodSpotId,
      menu_photo_url: params.menuPhotoUrl,
      file_name: params.fileName,
      file_size_bytes: params.fileSizeBytes ?? null,
      source: params.source ?? 'upload',
      batch_id: params.batchId ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('No id returned from menu_updates insert');
  return data.id as string;
}
