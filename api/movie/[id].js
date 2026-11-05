// ============================================================================
// Movie Mania LK — Edge Function: Movie Details API
// Endpoint: /api/movie/:id or /api/movie?id=:id
// ============================================================================

import { json, error, handleOptions } from '../_lib/respond.js';
import { getMovie, getAllMovies } from '../_lib/firebase.js';
import { getStills, searchStillsByTitle, getCastPhotos } from '../_lib/tmdb.js';
import {
  normalizeSeasons,
  computeCollection,
  computeSimilar,
  getCastList,
} from '../_lib/normalize.js';
import { getGeoSettings, evaluateGeo, stripItemForGeo } from '../_lib/geo.js';

export const config = {
  runtime: 'edge',
};

function stripSeoSuffix(s) {
  return String(s || '').replace(/-sinhala-subtitles?-?$/i, '').replace(/-sinhala-sub-?$/i, '');
}

function extractId(request) {
  const url = new URL(request.url);
  const qId = url.searchParams.get('id');
  if (qId) return stripSeoSuffix(decodeURIComponent(qId));

  const parts = url.pathname.split('/').filter(Boolean);
  const lastPart = parts[parts.length - 1];
  if (lastPart && lastPart !== 'movie' && lastPart !== '[id]' && lastPart !== '[id].js') {
    return stripSeoSuffix(decodeURIComponent(lastPart));
  }
  return null;
}

export default async function handler(request) {
  const customHeader = request.headers.get('X-Frontend-Access');
  if (customHeader !== 'true') {
    return error('Access denied: Direct access not allowed', 403);
  }

  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  if (request.method !== 'GET') {
    return error('Method not allowed', 405);
  }

  const id = extractId(request);
  if (!id) {
    return error('Missing or invalid movie ID', 400);
  }

  const geoSettings = await getGeoSettings();
  const gateActive = geoSettings.enabled;
  // Country resolution may need an IP lookup — run it in parallel with the
  // data fetch so it never adds latency to the response.
  const geoEvalPromise = gateActive
    ? evaluateGeo(request, geoSettings)
    : Promise.resolve({ allowed: true, country: null, settings: geoSettings });

  try {
    const [movieData, allData] = await Promise.all([
      getMovie(id),
      getAllMovies().catch(() => ({})),
    ]);

    if (!movieData) {
      return error('Movie not found', 404);
    }

    const rawItem = { id, ...movieData };
    normalizeSeasons(rawItem);

    // Geo gate: non-whitelisted countries get a STRIPPED item — the download /
    // player / subtitle URLs are removed here, before anything is serialised,
    // so they never reach the browser (not even in the network response).
    let item = rawItem;
    const geoEval = await geoEvalPromise;
    if (gateActive && !geoEval.allowed) {
      item = stripItemForGeo(rawItem, geoSettings).item;
    }
    // When the gate is on, responses differ per requesting country — caching a
    // single response at the CDN would leak stripped/allowed data across
    // regions, so bypass the CDN cache entirely.
    const cachePreset = gateActive ? 'none' : 'detail';

    const now = Date.now();
    const allList = allData && typeof allData === 'object'
      ? Object.entries(allData)
          .map(([k, v]) => ({ id: k, ...v }))
          .filter((m) => !m.scheduledAt || m.scheduledAt <= now)
          .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
      : [];

    const collection = computeCollection(allList, item);
    const similar = computeSimilar(allList, item, 12);
    const castNames = getCastList(item);

    // Concurrently enrich with TMDB media (stills and cast photos)
    const [stills, cast] = await Promise.all([
      item.tmdbId
        ? getStills(item.tmdbId, item.type || 'movie')
        : searchStillsByTitle(item.title, item.type || 'movie'),
      getCastPhotos(castNames),
    ]);

    // No geo metadata is exposed — a blocked visitor receives a normal
    // metadata-only response with no hint that any gate exists.
    return json({ item, collection, similar, stills, cast }, 200, {}, cachePreset);
  } catch (err) {
    console.error(`Edge Function /api/movie/${id} failed:`, err);
    return error(err.message || 'Internal Server Error', 500);
  }
}
