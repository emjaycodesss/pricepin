/**
 * FastAPI client for PricePin.
 * process-menu: upload image path + Turnstile token → parsed menu JSON.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface ParsedMenuItem {
  category?: string;
  item_name: string;
  variant_name?: string;
  price: number;
  description?: string;
}

export interface ProcessMenuResponse {
  items: ParsedMenuItem[];
  /** Storage path or URL of uploaded image for image_url on menu_items */
  image_url?: string;
}

/**
 * Send menu image (storage path or file) to FastAPI for Mistral OCR.
 * Caller must upload image to Supabase Storage first and pass path; or send FormData with file.
 */
export async function processMenu(
  payload: { storage_path: string; turnstile_token?: string } | FormData
): Promise<ProcessMenuResponse> {
  const isForm = payload instanceof FormData;
  const url = `${API_URL}/process-menu`;
  const options: RequestInit = {
    method: 'POST',
    headers: isForm ? {} : { 'Content-Type': 'application/json' },
    body: isForm ? (payload as FormData) : JSON.stringify(payload),
  };
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(res.status === 429 ? 'Too many requests. Try again later.' : text || `HTTP ${res.status}`);
  }
  return res.json();
}
