/**
 * Left column: camera capture and file upload. Keeps uploaded image visible as reference.
 * On file select: compresses client-side, uploads to Supabase Storage (menu_photos), then notifies parent.
 * "Scan menu with AI" sends image to OCR and returns parsed items to parent.
 */
import { useRef, useState } from 'react';
import { processMenu, type ParsedMenuItem } from '../lib/api';
import { fileToWebP, compressMenuPhoto } from '../lib/imageToWebp';
import { uploadMenuPhoto, type MenuPhotoUploadResult } from '../lib/menuPhotoUpload.ts';

export type MenuPhotoSource = 'upload' | 'capture';

export interface MenuPhotoUploadComplete {
  publicUrl: string;
  fileName: string;
  fileSizeBytes: number;
  source: MenuPhotoSource;
}

interface MediaInputSectionProps {
  onOcrResult: (items: ParsedMenuItem[]) => void;
  /** When provided, menu photo is uploaded to storage and this is called with URL + metadata. */
  spotId?: string | null;
  spotName?: string | null;
  onUploadComplete?: (result: MenuPhotoUploadComplete) => void;
}

export function MediaInputSection({
  onOcrResult,
  spotId,
  spotName,
  onUploadComplete,
}: MediaInputSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const clearPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    setOcrError(null);
    setUploadError(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setOcrError('Please select an image file.');
      return;
    }
    clearPreview();
    setPreviewUrl(URL.createObjectURL(file));
    setSelectedFile(file);
    setOcrError(null);

    if (spotId && onUploadComplete) {
      setUploading(true);
      setUploadError(null);
      try {
        const compressed = await compressMenuPhoto(file);
        const result: MenuPhotoUploadResult = await uploadMenuPhoto(compressed, spotName ?? undefined);
        const source: MenuPhotoSource =
          file.name.toLowerCase().startsWith('image.') || /^img[_\-]/i.test(file.name)
            ? 'capture'
            : 'upload';
        onUploadComplete({
          publicUrl: result.publicUrl,
          fileName: result.fileName,
          fileSizeBytes: result.fileSizeBytes,
          source,
        });
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed.');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleReadWithAi = async () => {
    if (!selectedFile) {
      setOcrError('Upload an image first.');
      return;
    }
    setOcrLoading(true);
    setOcrError(null);
    try {
      const webpFile = await fileToWebP(selectedFile);
      const form = new FormData();
      form.append('file', webpFile);
      const res = await processMenu(form);
      onOcrResult(res.items ?? []);
    } catch (err) {
      const message =
        err instanceof Error && err.message === 'Failed to fetch'
          ? 'API not reachable. Start the backend (see README) or add items manually.'
          : err instanceof Error
            ? err.message
            : 'OCR failed. You can still add items manually.';
      setOcrError(message);
    } finally {
      setOcrLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Section title — same style as Menu items (text-sm font-semibold text-gray-800) */}
      <h2 className="text-sm font-semibold text-gray-800 mb-3">Menu photo</h2>
      {/* Upload / capture area — same dashed style as Add Food Spot photo zone */}
      <div className="flex flex-col gap-2 mb-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Upload or capture menu image"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="min-h-[44px] w-full rounded-xl border border-dashed border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 text-sm font-medium transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EA000B] disabled:opacity-60 disabled:cursor-wait"
        >
          {uploading ? 'Compressing & uploading…' : previewUrl ? 'Change photo' : 'Choose/capture photo of menu'}
        </button>
      </div>
      {/* Persistent image preview */}
      {previewUrl && (
        <div className="flex-1 min-h-[200px] rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center">
          <img
            src={previewUrl}
            alt="Menu reference"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
      {!previewUrl && (
        <div className="flex-1 min-h-[200px] rounded-xl border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-sm font-medium text-gray-500">
          No photo yet
        </div>
      )}
      {/* Scan with AI — brand red primary CTA */}
      <button
        type="button"
        onClick={handleReadWithAi}
        disabled={!selectedFile || ocrLoading}
        className="mt-3 min-h-[44px] w-full rounded-xl bg-[#EA000B] text-white font-semibold hover:bg-[#c20009] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white transition-colors"
      >
        {ocrLoading ? 'Scanning…' : 'Scan menu with AI'}
      </button>
      {(uploadError || ocrError) && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {uploadError ?? ocrError}
        </p>
      )}
    </div>
  );
}
