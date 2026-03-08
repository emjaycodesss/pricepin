/**
 * Photon (Komoot) geocoding API: address ↔ coordinates.
 * Forward: search/geocode. Reverse: coords → human-readable address.
 */

const PHOTON_API = 'https://photon.komoot.io/api/';
const PHOTON_REVERSE = 'https://photon.komoot.io/reverse';

export interface PhotonFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    [k: string]: unknown;
  };
}

export interface PhotonResult {
  type: 'FeatureCollection';
  features: PhotonFeature[];
}

/** Build a single display line from Photon feature properties. */
export function formatPhotonAddress(properties: PhotonFeature['properties']): string {
  const parts: string[] = [];
  if (properties.name) parts.push(properties.name);
  if (properties.street) {
    parts.push([properties.housenumber, properties.street].filter(Boolean).join(' '));
  }
  if (properties.postcode) parts.push(properties.postcode);
  if (properties.city) parts.push(properties.city);
  if (properties.state) parts.push(properties.state);
  if (properties.country) parts.push(properties.country);
  return parts.filter(Boolean).join(', ') || 'Unknown address';
}

/**
 * Reverse geocode: coords → human-readable address (closest street/place).
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng) });
  const res = await fetch(`${PHOTON_REVERSE}?${params}`);
  if (!res.ok) return null;
  const data: PhotonResult = await res.json();
  const feature = data.features?.[0];
  if (!feature?.properties) return null;
  return formatPhotonAddress(feature.properties);
}

/** One autocomplete suggestion: display name + coords. */
export interface PhotonSuggestion {
  displayName: string;
  lat: number;
  lng: number;
}

/** Philippines bounding box (minLon, minLat, maxLon, maxLat) — restrict search to country, not strict Davao. */
const PH_BBOX = '116.7,4.3,126.6,21.1';

export interface SearchAddressOptions {
  /** Current map center lat — passed to Photon for proximity bias (results near this location first). */
  lat?: number;
  /** Current map center lon — passed to Photon for proximity bias. */
  lon?: number;
}

/**
 * Search/autocomplete: query → list of suggestions with display name and coordinates.
 * Restricted to Philippines via bbox; optionally biased by map center (lat/lon) so e.g. Davao view
 * shows Davao results first, Manila view shows Manila results first.
 */
export async function searchAddress(query: string, options?: SearchAddressOptions): Promise<PhotonSuggestion[]> {
  if (!query.trim()) return [];
  const params = new URLSearchParams({
    q: query.trim(),
    limit: '15',
    bbox: PH_BBOX,
  });
  if (options?.lat != null && !Number.isNaN(options.lat)) params.set('lat', String(options.lat));
  if (options?.lon != null && !Number.isNaN(options.lon)) params.set('lon', String(options.lon));
  const res = await fetch(`${PHOTON_API}?${params}`);
  if (!res.ok) return [];
  const data: PhotonResult = await res.json();
  const features = (data.features ?? []).filter((f) => f.geometry?.coordinates?.length === 2);
  return features.slice(0, 8).map((f) => {
    const [lng, lat] = f.geometry.coordinates;
    return {
      displayName: formatPhotonAddress(f.properties),
      lat,
      lng,
    };
  });
}

/**
 * Geocode a place name (e.g. "Manila", "Makati") and return the first result's [lat, lng] or null.
 */
export async function geocode(query: string): Promise<[number, number] | null> {
  if (!query.trim()) return null;
  const params = new URLSearchParams({ q: query.trim(), limit: '1' });
  const res = await fetch(`${PHOTON_API}?${params}`);
  if (!res.ok) return null;
  const data: PhotonResult = await res.json();
  const feature = data.features?.[0];
  if (!feature?.geometry?.coordinates?.length) return null;
  const [lng, lat] = feature.geometry.coordinates;
  return [lat, lng];
}
