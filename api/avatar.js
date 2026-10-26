// ============================================================================
// Movie Mania LK — Edge Function: Profile picture upload (imgbb proxy)
// Endpoint: POST /api/avatar  { image: "<base64, no data: prefix>" }
// Returns:  { url: "https://i.ibb.co/..." }
// ============================================================================

import { json, error, handleOptions } from './_lib/respond.js';

// The site key is tried first. IMGBB_API_KEY (Vercel env var) is only a backup,
// so an old/wrong value in the dashboard can no longer break uploads.
const SITE_KEY = '0f79f50eab927b1dee582a781331ecd8';
const KEYS = [...new Set([SITE_KEY, process.env.IMGBB_API_KEY].filter(Boolean))];

export const config = {
  runtime: 'edge',
};

async function uploadToImgbb(key, image) {
  const body = new URLSearchParams();
  body.set('key', key);
  body.set('image', image);

  const res = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  // imgbb can answer with HTML on some failures — never assume JSON
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}

  if (data && data.success && data.data) {
    return { url: data.data.display_url || data.data.url || '' };
  }
  const msg =
    (data && data.error && (data.error.message || data.error)) ||
    `imgbb responded ${res.status}`;
  return { error: String(msg) };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return error('Method not allowed', 405);

  try {
    const body = await request.json();
    let image = String(body.image || '');
    image = image.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    if (!image) return error('image is required', 400);
    // Avatars are resized client-side to ~256px; reject anything huge.
    if (image.length > 1_500_000) return error('Image too large', 413);

    let lastError = 'Upload failed';
    for (const key of KEYS) {
      const out = await uploadToImgbb(key, image);
      if (out.url) return json({ url: out.url });
      lastError = out.error || lastError;
    }
    return error(lastError, 502);
  } catch (err) {
    return error(err.message || 'Upload failed', 500);
  }
}
