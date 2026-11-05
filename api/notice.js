// ============================================================================
// Movie Mania LK — Edge Function: Notice Bar API
// Endpoint: GET /api/notice  → { active, notices[] }
// Public, cached briefly at edge.
// ============================================================================

import { json, error, handleOptions } from './_lib/respond.js';
import { getNoticeBar } from './_lib/firebase.js';

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

  try {
    const data = await getNoticeBar();
    return json({ active: !!data.active, notices: data.notices || [] }, 200, {}, 'list');
  } catch (err) {
    console.error('Edge Function /api/notice failed:', err);
    return error(err.message || 'Internal Server Error', 500);
  }
}
