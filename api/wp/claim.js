// ============================================================================
// Movie Mania LK — WhatsApp download gate
// POST /api/wp/claim   body: { code, idToken }
//
//  • must be logged in (valid Firebase ID token)
//  • free account  → 3 downloads / day, then 429 "limit"
//  • premium       → unlimited
//  • success       → { whatsappUrl, premium, used, limit, remaining }
// ============================================================================

import {
  getBotFile,
  isValidBotCode,
  buildWhatsAppUrl,
  isPostgresConfigured,
} from '../_lib/postgres.js';
import {
  FREE_DAILY_LIMIT,
  verifyIdToken,
  isPremiumUser,
  getUsedToday,
  consumeFreeDownload,
} from '../_lib/wpLimit.js';

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', 'https://www.moviemanialk.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (_) { return {}; }
}

async function fetchBotNumber(req) {
  try {
    const host = req.headers.host || 'www.moviemanialk.com';
    const r = await fetch(`https://${host}/api/settings`, { headers: { Accept: 'application/json' } });
    if (r.ok) {
      const d = await r.json();
      if (d && d.wpBotNumber) return d.wpBotNumber;
    }
  } catch (_) {}
  return process.env.WHATSAPP_BOT_NUMBER || '';
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { send(res, 204, {}); return; }
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed' }); return; }

  if (!isPostgresConfigured()) {
    send(res, 503, { error: 'Download service is not configured yet.' });
    return;
  }

  const body = await readBody(req);
  const code = String(body.code || '');
  if (!isValidBotCode(code)) { send(res, 400, { error: 'Invalid download code.' }); return; }

  // 1) Login required
  const user = await verifyIdToken(body.idToken);
  if (!user) {
    send(res, 401, {
      error: 'login_required',
      message: 'WhatsApp Download කරන්න මුලින් Login වෙන්න.',
    });
    return;
  }

  try {
    const file = await getBotFile(code);
    if (!file) { send(res, 404, { error: 'Download link not found or expired.' }); return; }

    const whatsappUrl = buildWhatsAppUrl(file.code, await fetchBotNumber(req));
    if (!whatsappUrl) {
      send(res, 503, { error: 'WhatsApp bot number is not configured. Set it in Admin Panel → Settings.' });
      return;
    }

    // 2) Premium = unlimited
    if (await isPremiumUser(user.uid, user.email)) {
      send(res, 200, { success: true, premium: true, whatsappUrl });
      return;
    }

    // 3) Free = 3 per day
    const result = await consumeFreeDownload(user.uid, FREE_DAILY_LIMIT);
    if (!result.ok) {
      send(res, 429, {
        error: 'limit',
        message: 'Daily Limit Reached',
        used: result.used,
        limit: FREE_DAILY_LIMIT,
      });
      return;
    }

    send(res, 200, {
      success: true,
      premium: false,
      whatsappUrl,
      used: result.used,
      limit: FREE_DAILY_LIMIT,
      remaining: Math.max(0, FREE_DAILY_LIMIT - result.used),
    });
  } catch (err) {
    console.error('[wp/claim] failed:', err.message);
    send(res, 500, { error: 'Download service temporarily unavailable. Please try again.' });
  }
}
