// ============================================================================
// Movie Mania LK — Edge Function: Secure Admin Database Proxy
// Endpoint: /api/admin/db?path=...
// Proxies Realtime Database operations server-side after verifying admin token.
// ============================================================================

import { json, error, handleOptions } from '../_lib/respond.js';
import { verifyAdminToken, extractToken } from '../_lib/adminAuth.js';

const FIREBASE_DB_URL =
  process.env.FIREBASE_DB_URL || 'https://cineflix1-1fdc6-default-rtdb.firebaseio.com';
const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY || 'AIzaSyAh6zMB65iWqt3R2Ep0C5_7eV8ZaUHI7t8';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  // 1. Authorize admin token
  const token = extractToken(request);
  const isAuthorized = await verifyAdminToken(token);
  if (!isAuthorized) {
    return error('Unauthorized: Valid admin token required', 401);
  }

  // 2. Extract path & query parameters
  const url = new URL(request.url);
  const rawPath = url.searchParams.get('path') || '';
  const cleanPath = rawPath.replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '');

  if (!cleanPath) {
    return error('Missing path parameter', 400);
  }

  // Build target Firebase URL
  const targetUrl = new URL(`${FIREBASE_DB_URL}/${cleanPath}.json`);
  if (FIREBASE_API_KEY) {
    targetUrl.searchParams.set('key', FIREBASE_API_KEY);
  }

  // Forward optional query parameters (orderBy, limitToLast, limitToFirst, startAt, endAt, equalTo)
  const allowedQueryParams = [
    'orderBy',
    'limitToLast',
    'limitToFirst',
    'startAt',
    'endAt',
    'equalTo',
    'shallow',
  ];
  for (const q of allowedQueryParams) {
    const val = url.searchParams.get(q);
    if (val !== null) {
      targetUrl.searchParams.set(q, val);
    }
  }

  try {
    const method = request.method;
    let fetchOptions = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (method === 'PUT' || method === 'POST' || method === 'PATCH') {
      const bodyText = await request.text();
      fetchOptions.body = bodyText;
    }

    const res = await fetch(targetUrl.toString(), fetchOptions);
    const data = await res.json().catch(() => null);

    return json(data, res.status);
  } catch (err) {
    return error(err.message || 'Database proxy operation failed', 500);
  }
}

