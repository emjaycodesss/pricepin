/**
 * Admin API client. All requests send X-Admin-Token from sessionStorage (set after guard login).
 * Backend validates token and uses service role; RLS no longer allows anon to perform these mutations.
 */

/** Base API URL (no trailing slash) so paths never get double slashes. */
const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const ADMIN_TOKEN_KEY = 'pricepin_admin_token';

function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

function adminHeaders(): HeadersInit {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['X-Admin-Token'] = token;
  return headers;
}

async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...adminHeaders(), ...(options.headers as Record<string, string>) },
  });
  return res;
}

/** Verify admin token with backend; returns true if valid. */
export async function verifyAdminToken(token: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/admin/me`, {
    method: 'GET',
    headers: { 'X-Admin-Token': token },
  });
  return res.ok;
}

export async function adminVerifySpot(spotId: string): Promise<void> {
  const res = await adminFetch(`/admin/food-spots/${spotId}/verify`, { method: 'POST' });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === 'string') msg = j.detail;
    } catch {
      /**/
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
}

export async function adminUpdateFoodSpot(spotId: string, payload: { is_permanently_closed?: boolean }): Promise<void> {
  const res = await adminFetch(`/admin/food-spots/${spotId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === 'string') msg = j.detail;
    } catch {
      /**/
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
}

export async function adminDeleteFoodSpot(spotId: string): Promise<void> {
  const res = await adminFetch(`/admin/food-spots/${spotId}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === 'string') msg = j.detail;
    } catch {
      /**/
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
}

export async function adminUpdateMenuItem(
  itemId: string,
  payload: {
    item_name?: string;
    price?: number;
    category?: string | null;
    variant_name?: string | null;
    description?: string | null;
  }
): Promise<void> {
  const res = await adminFetch(`/admin/menu-items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === 'string') msg = j.detail;
    } catch {
      /**/
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
}

export async function adminDeleteMenuItem(itemId: string): Promise<void> {
  const res = await adminFetch(`/admin/menu-items/${itemId}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === 'string') msg = j.detail;
    } catch {
      /**/
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
}

export async function adminBatchUpdateMenuItemCategory(
  itemIds: string[],
  newCategory: string | null
): Promise<void> {
  const res = await adminFetch('/admin/menu-items/batch-update-category', {
    method: 'POST',
    body: JSON.stringify({ itemIds, newCategory }),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === 'string') msg = j.detail;
    } catch {
      /**/
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
}

export async function adminDeleteMenuUpdate(updateId: string): Promise<void> {
  const res = await adminFetch(`/admin/menu-updates/${updateId}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === 'string') msg = j.detail;
    } catch {
      /**/
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
}

export async function adminRejectMenuUpdates(params: {
  menuUpdateIds?: string[];
  batchId?: string | null;
}): Promise<void> {
  const body: { menuUpdateIds?: string[]; batchId?: string } = {};
  if (params.menuUpdateIds?.length) body.menuUpdateIds = params.menuUpdateIds;
  if (params.batchId) body.batchId = params.batchId;
  const res = await adminFetch('/admin/menu-updates/reject', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === 'string') msg = j.detail;
    } catch {
      /**/
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
}
