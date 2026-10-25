// ============================================================================
// Movie Mania LK — Edge Function: Metrics & Analytics API
// Endpoint: /api/views
// ============================================================================

import { json, error, handleOptions } from './_lib/respond.js';
import { incrementField, logRecentDownload } from './_lib/firebase.js';

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

  if (request.method !== 'POST') {
    return error('Method not allowed', 405);
  }

  try {
    const body = await request.json();

    if (body.downloadLog) {
      try {
        await logRecentDownload(body.downloadLog);
      } catch (_) {}
    }

    const id = body.id || body.movieId;
    const field = body.field || 'views';

    if (id) {
      const result = await incrementField(id, field);
      return json({ success: true, ...result });
    }

    return json({ success: true });
  } catch (err) {
    return error(err.message || 'Failed to update metric', 500);
  }
}
