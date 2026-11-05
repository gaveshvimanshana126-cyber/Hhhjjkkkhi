// ============================================================================
// Movie Mania LK — Edge Function: Admin Media & Subtitle Uploader
// Endpoint: /api/admin/upload?folder=...&filename=...&provider=...
// Streams file directly to Supabase or Firebase Storage using server secrets.
// ============================================================================

import { json, error, handleOptions } from '../_lib/respond.js';
import { verifyAdminToken, extractToken } from '../_lib/adminAuth.js';

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://oqisvxsvkjyltvpwnago.supabase.co';
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  'sb_secret_XRrJrATtYhQQWOMF6iXSsw_TJ_1lybH';
const SUPABASE_SUB_BUCKET = process.env.SUPABASE_SUB_BUCKET || 'subtitles';

const FIREBASE_STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || 'cineflix1-1fdc6.firebasestorage.app';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  if (request.method !== 'POST') {
    return error('Method not allowed', 405);
  }

  // 1. Authorize admin token
  const token = extractToken(request);
  const isAuthorized = await verifyAdminToken(token);
  if (!isAuthorized) {
    return error('Unauthorized: Valid admin token required', 401);
  }

  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') || 'supabase';
  const folder = url.searchParams.get('folder') || '';
  const rawFileName = url.searchParams.get('filename') || `file_${Date.now()}`;
  const contentType =
    request.headers.get('content-type') || 'application/octet-stream';

  const fileData = await request.arrayBuffer();
  if (!fileData || fileData.byteLength === 0) {
    return error('No file data provided', 400);
  }

  try {
    if (provider === 'firebase') {
      const safeName = `${Date.now()}_${rawFileName.replace(/[^\w.\-]+/g, '_')}`;
      const path = folder ? `${folder}/${safeName}` : `subtitles/${safeName}`;
      const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o?name=${encodeURIComponent(path)}`;

      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: fileData,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Firebase upload failed: ${errText || res.status}`);
      }

      const data = await res.json();
      const tokenParam = data.downloadTokens ? `&token=${data.downloadTokens}` : '';
      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media${tokenParam}`;

      return json({ success: true, url: publicUrl, path });
    }

    // Default: Supabase Storage
    const cleanFileName = folder ? `${folder}/${rawFileName}` : rawFileName;
    const targetUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_SUB_BUCKET}/${cleanFileName}`;

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        apikey: SUPABASE_SECRET_KEY,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: fileData,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Supabase upload failed: ${errText || res.status}`);
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_SUB_BUCKET}/${cleanFileName}`;
    return json({ success: true, url: publicUrl, filename: cleanFileName });
  } catch (err) {
    return error(err.message || 'File upload failed', 500);
  }
}

