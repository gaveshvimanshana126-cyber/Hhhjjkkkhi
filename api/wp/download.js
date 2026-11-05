// ============================================================================
// Movie Mania LK — Public WhatsApp download redirect
// Endpoint: /wp/download/:code  →  /api/wp/download?code=:code
//
// Looks up the code in Postgres (bot_files only) and redirects the visitor to
// the WhatsApp bot with the `.dl <code>` command. The real file URL is never
// returned by this endpoint.
// ============================================================================

import {
  getBotFile,
  isValidBotCode,
  buildWhatsAppUrl,
  isPostgresConfigured,
} from '../_lib/postgres.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://www.moviemanialk.com',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function applyCors(res) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }
}

function extractCode(req) {
  const host = req.headers.host || 'www.moviemanialk.com';
  const url = new URL(req.url || '/', `https://${host}`);
  const queryCode =
    url.searchParams.get('code') ||
    url.searchParams.get('file') ||
    url.searchParams.get('id');
  if (queryCode) return decodeURIComponent(queryCode);

  const match = url.pathname.match(/\/wp\/download\/([^/]+)\/?$/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

/** Fetch the configured WhatsApp bot number from settings API (with env fallback). */
async function fetchBotNumber(req) {
  try {
    const host = req.headers.host || 'www.moviemanialk.com';
    const settingsRes = await fetch(
      `https://${host}/api/settings`,
      { headers: { Accept: 'application/json' } }
    );
    if (settingsRes.ok) {
      const data = await settingsRes.json();
      if (data && data.wpBotNumber) return data.wpBotNumber;
    }
  } catch (_) {
    // Fall through to env var
  }
  return process.env.WHATSAPP_BOT_NUMBER || '';
}

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!isPostgresConfigured()) {
    sendJson(res, 503, { error: 'Download service is not configured yet.' });
    return;
  }

  const code = extractCode(req);
  if (!isValidBotCode(code)) {
    sendJson(res, 400, { error: 'Invalid download code.' });
    return;
  }

  try {
    const file = await getBotFile(code);
    if (!file) {
      sendJson(res, 404, { error: 'Download link not found or expired.' });
      return;
    }

    const botNumber = await fetchBotNumber(req);
    const whatsappUrl = buildWhatsAppUrl(file.code, botNumber);
    if (!whatsappUrl) {
      sendJson(res, 503, {
        error: 'WhatsApp bot number is not configured. Set it in Admin Panel → Settings.',
      });
      return;
    }

    // Useful for the admin panel / debugging without exposing the file URL.
    const wantsJson =
      String(req.headers.accept || '').includes('application/json') ||
      new URL(req.url || '/', 'https://x').searchParams.get('format') === 'json';
    if (wantsJson) {
      sendJson(res, 200, {
        success: true,
        code: file.code,
        title: file.title || '',
        whatsappUrl,
      });
      return;
    }

    res.statusCode = 302;
    res.setHeader('Location', whatsappUrl);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.end();
  } catch (err) {
    console.error('[wp/download] lookup failed:', err.message);
    sendJson(res, 500, {
      error: 'Download service temporarily unavailable. Please try again.',
    });
  }
}
