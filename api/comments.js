// ============================================================================
// Movie Mania LK — Edge Function: Comments API
// Endpoint: /api/comments
// ============================================================================

import { json, error, handleOptions } from './_lib/respond.js';
import { getComments, postComment } from './_lib/firebase.js';

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

  const url = new URL(request.url);

  if (request.method === 'GET') {
    const movieId = url.searchParams.get('id');
    if (!movieId) {
      return error('Missing movie ID (?id=...)', 400);
    }
    try {
      const comments = await getComments(movieId);
      return json(comments, 200, {}, 'none');
    } catch (err) {
      return error(err.message, 500);
    }
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const movieId = body.movieId || body.movie;
      const name = (body.name || 'Anonymous').slice(0, 50);
      const text = (body.text || '').trim().slice(0, 500);

      if (!movieId || !text) {
        return error('Missing required fields: movieId and text', 400);
      }

      const payload = {
        name,
        text,
        date: body.date || new Date().toLocaleDateString(),
        movie: movieId,
        createdAt: Date.now(),
      };

      const result = await postComment(movieId, payload);
      return json({ success: true, id: result.name, comment: payload }, 201);
    } catch (err) {
      return error(err.message || 'Failed to post comment', 500);
    }
  }

  return error('Method not allowed', 405);
}
