// ============================================================================
// Movie Mania LK — Secure admin API: create a WhatsApp bot file
// Endpoint: POST /api/admin/bot-files
//
// Stores the real file URL in Postgres `bot_files` and returns a short code
// plus a public `/wp/download/<code>` path. Admin token required.
// No other table is ever queried.
// ============================================================================

import { verifyAdminToken } from '../_lib/adminAuth.js';
import {
  createBotFile,
  buildWhatsAppUrl,
  buildTelegramUrl,
  isPostgresConfigured,
} from '../_lib/postgres.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://www.moviemanialk.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Admin-Token, X-Frontend-Access, X-Verified',
};

function applyCors(res) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }
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

function getToken(req) {
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();

  const headerToken = req.headers['x-admin-token'];
  if (headerToken) {
    return Array.isArray(headerToken) ? headerToken[0] : String(headerToken).trim();
  }

  const host = req.headers.host || 'www.moviemanialk.com';
  const url = new URL(req.url || '/', `https://${host}`);
  return url.searchParams.get('token') || url.searchParams.get('auth') || '';
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body);
  }

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Request body too large');
  }
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const token = getToken(req);
  if (!(await verifyAdminToken(token))) {
    sendJson(res, 401, {
      error: 'Unauthorized: Valid admin token required',
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const fileUrl = String(body.url || '').trim();
  if (!/^https?:\/\//i.test(fileUrl)) {
    sendJson(res, 400, {
      error: 'A valid file URL starting with http:// or https:// is required',
    });
    return;
  }
  if (fileUrl.length > 4096) {
    sendJson(res, 400, { error: 'File URL is too long' });
    return;
  }

  const title = String(body.title || 'MovieManiaLK file').trim().slice(0, 300);
  const type = String(body.type || 'document').trim().slice(0, 40) || 'document';
  const deleteAfterSend =
    body.deleteAfterSend === true || body.delete_after_send === true;

  if (!isPostgresConfigured()) {
    sendJson(res, 503, {
      error:
        'Postgres is not configured. Add DATABASE_URL in Vercel → Settings → Environment Variables.',
    });
    return;
  }

  try {
    const file = await createBotFile({
      title,
      url: fileUrl,
      type,
      deleteAfterSend,
    });

    const downloadPath = `/wp/download/${file.code}`;
    const botNumber = await fetchBotNumber(req);
    const whatsappUrl = buildWhatsAppUrl(file.code, botNumber);
    const telegramUrl = buildTelegramUrl(file.code);

    sendJson(res, 200, {
      success: true,
      code: file.code,
      title: file.title || title,
      downloadPath,
      whatsappUrl,
      telegramUrl,
      botConfigured: !!whatsappUrl,
    });
  } catch (err) {
    console.error('[admin/bot-files] create failed:', err.message);
    sendJson(res, 500, {
      error: 'Could not save the file to Postgres. Check DATABASE_URL and the bot_files table.',
    });
  }
}
