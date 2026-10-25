// ============================================================================
// Movie Mania LK — Edge Function: TMDB Proxy API
// Endpoint: /api/tmdb?path=... or /api/tmdb?q=...
// ============================================================================

import { json, error, handleOptions } from './_lib/respond.js';
import { searchMulti } from './_lib/tmdb.js';

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_TOKEN =
  process.env.TMDB_TOKEN ||
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI2ZWJkMDRhMTVhNzY0YWVmYmJjNzEyMGY5YTFmN2ZjYyIsIm5iZiI6MTc3NDA1OTkzNi43MjMsInN1YiI6IjY5YmUwMWEwMDI2ZjU1MjkwZmE1ZGVlYyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.RcaHm0ztmGjBYFjJ5VFs6bnTtXrj95oK1dlPXj4cGdg';

export const config = {
  runtime: 'edge',
};

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

  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  const query = url.searchParams.get('q') || url.searchParams.get('query');

  // Proxy direct TMDB path (e.g. for actor profile, combined credits, etc.)
  if (path) {
    try {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      const res = await fetch(`${TMDB_API}${cleanPath}`, {
        headers: {
          Authorization: `Bearer ${TMDB_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      return json(data, res.status, {}, 'list');
    } catch (err) {
      return error(err.message || 'TMDB proxy request failed', 500);
    }
  }

  // Multi-search for user requests
  if (query) {
    try {
      const results = await searchMulti(query);
      return json({ results }, 200, {}, 'list');
    } catch (err) {
      return error(err.message || 'TMDB search failed', 500);
    }
  }

  return error('Missing path or q parameter', 400);
}
