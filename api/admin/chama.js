// ============================================================================
// Movie Mania LK — Edge Function: Chama Movie API Proxy
// Endpoint: /api/admin/chama?action=search&q=... or ?action=infodl&q=...
// ============================================================================

import { json, error, handleOptions } from '../_lib/respond.js';
import { verifyAdminToken, extractToken } from '../_lib/adminAuth.js';

const CHAMA_BASE =
  process.env.CHAMA_BASE ||
  'https://chama-movie-api.koyeb.app/api/v1/movie/moviebox';
const CHAMA_KEY =
  process.env.CHAMA_KEY || 'chama_api_584829ed7f1b24120633e2c272f9b98d';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  // Authorize admin token
  const token = extractToken(request);
  const isAuthorized = await verifyAdminToken(token);
  if (!isAuthorized) {
    return error('Unauthorized: Valid admin token required', 401);
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'search';
  const q = url.searchParams.get('q') || '';

  if (!q) {
    return error('Missing query parameter q', 400);
  }

  try {
    const endpoint = action === 'infodl' ? 'infodl' : 'search';
    const targetUrl = `${CHAMA_BASE}/${endpoint}?q=${encodeURIComponent(q)}&api_key=${CHAMA_KEY}`;

    const res = await fetch(targetUrl);
    const data = await res.json();
    return json(data, res.status);
  } catch (err) {
    return error(err.message || 'Chama API request failed', 500);
  }
}

