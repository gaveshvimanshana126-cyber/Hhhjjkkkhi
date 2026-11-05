// ============================================================================
// Movie Mania LK — Admin Settings API
// Endpoint: /api/admin/settings
// Secured: Admin token required.
// GET  → Returns bot settings (wpBotNumber, tgBotUsername)
// POST → Saves bot settings to Firebase (settings/wpBotNumber, settings/tgBotUsername)
// ============================================================================

import { json, error, handleOptions } from '../_lib/respond.js';
import { verifyAdminToken, extractToken } from '../_lib/adminAuth.js';
import { getSetting, setSetting } from '../_lib/firebase.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://www.moviemanialk.com',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

  // 1. Authorize admin token
  const token = getToken(req);
  if (!(await verifyAdminToken(token))) {
    sendJson(res, 401, { error: 'Unauthorized: Valid admin token required' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const [wpNumber, tgUsername] = await Promise.all([
        getSetting('settings/wpBotNumber'),
        getSetting('settings/tgBotUsername'),
      ]);
      sendJson(res, 200, {
        wpBotNumber: wpNumber || '',
        tgBotUsername: tgUsername || '',
        whatsappConfigured: !!wpNumber,
        telegramConfigured: !!tgUsername,
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message || 'Failed to load settings' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  // 2. Save settings
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const wpBotNumber = String(body.wpBotNumber || '').replace(/[^0-9]/g, '');
  const tgBotUsername = String(body.tgBotUsername || '').replace(/^@/, '').trim();

  if (!wpBotNumber) {
    sendJson(res, 400, { error: 'WhatsApp bot number is required' });
    return;
  }

  try {
    await Promise.all([
      setSetting('settings/wpBotNumber', wpBotNumber),
      setSetting('settings/tgBotUsername', tgBotUsername),
    ]);

    sendJson(res, 200, {
      success: true,
      wpBotNumber,
      tgBotUsername,
      message: 'Bot settings saved successfully',
    });
  } catch (err) {
    console.error('[admin/settings] save failed:', err.message);
    sendJson(res, 500, { error: 'Failed to save settings' });
  }
}
