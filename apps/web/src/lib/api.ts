/**
 * FastAPI client for PricePin.
 * process-menu: upload image path + Turnstile token → parsed menu JSON.
 */

/** Base API URL (no trailing slash) so paths like /process-menu never become //process-menu. */
const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

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
 * When using FormData with file, append turnstile_token if you have a Cloudflare Turnstile token
 * (required by API when TURNSTILE_SECRET is set): form.append('turnstile_token', token).
 */
export async function processMenu(
  payload: { storage_path: string; turnstile_token?: string } | FormData
): Promise<ProcessMenuResponse> {
  const isForm = payload instanceof FormData;
  const url = `${API_URL}/process-menu`;
  let body: FormData | string;
  if (isForm) {
    body = payload as FormData;
  } else {
    body = JSON.stringify(payload);
  }
  const options: RequestInit = {
    method: 'POST',
    headers: isForm ? {} : { 'Content-Type': 'application/json' },
    body,
  };
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    // Prefer API detail message; for 429 use backend message if present
    let message = text || `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (typeof json?.detail === 'string') message = json.detail;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return res.json();
}
