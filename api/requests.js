// ============================================================================
// Movie Mania LK — Edge Function: User Title Requests API
// Endpoint: /api/requests
// ============================================================================

import { json, error, handleOptions } from './_lib/respond.js';
import { getRequests, postRequest } from './_lib/firebase.js';

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

  if (request.method === 'GET') {
    try {
      const requests = await getRequests(30);
      return json(requests, 200, {}, 'none');
    } catch (err) {
      return error(err.message, 500);
    }
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const movie = (body.movie || body.title || '').trim().slice(0, 150);
      const user = (body.user || body.name || '').trim().slice(0, 80);
      const email = (body.email || '').trim().slice(0, 100);

      if (!movie || !user || !email) {
        return error('Missing required fields: movie, user, email', 400);
      }

      const payload = {
        movie,
        tmdbId: body.tmdbId || null,
        mediaType: body.mediaType || 'movie',
        posterPath: body.posterPath || '',
        user,
        email,
        time: Date.now(),
        status: 'pending',
      };

      const result = await postRequest(payload);
      return json({ success: true, id: result.name }, 201);
    } catch (err) {
      return error(err.message || 'Failed to submit request', 500);
    }
  }

  return error('Method not allowed', 405);
}
