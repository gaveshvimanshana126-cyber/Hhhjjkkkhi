// ============================================================================
// Movie Mania LK — Edge Function Response Utility
// Provides standardized JSON, CORS, and caching responses for Edge Functions.
// ============================================================================

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://www.moviemanialk.com/',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export const CACHE_PRESETS = {
  detail: 'public, s-maxage=300, stale-while-revalidate=3600',
  list: 'public, s-maxage=180, stale-while-revalidate=86400',
  none: 'no-store, no-cache, must-revalidate, proxy-revalidate',
};

/**
 * Creates a standard JSON response with CORS and optional caching headers.
 */
export function json(data, status = 200, extraHeaders = {}, cachePreset = null) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
    ...extraHeaders,
  };
  if (cachePreset && CACHE_PRESETS[cachePreset]) {
    headers['Cache-Control'] = CACHE_PRESETS[cachePreset];
  }
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

/**
 * Creates a standardized JSON error response.
 */
export function error(message, status = 500, extraHeaders = {}) {
  return json({ error: String(message), status }, status, extraHeaders);
}

/**
 * Handles HTTP OPTIONS preflight requests.
 */
export function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
