// ============================================================================
// Movie Mania LK — Public Settings API
// Endpoint: /api/settings (GET)
// Returns bot configuration for WhatsApp/Telegram file delivery.
// No admin auth required — only exposes public-facing bot config.
// ============================================================================

import { json, error, handleOptions } from './_lib/respond.js';
import { getSetting } from './_lib/firebase.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  if (request.method !== 'GET') {
    return error('Method not allowed', 405);
  }

  try {
    const [wpNumber, tgUsername] = await Promise.all([
      getSetting('settings/wpBotNumber'),
      getSetting('settings/tgBotUsername'),
    ]);

    return json({
      wpBotNumber: wpNumber || '',
      tgBotUsername: tgUsername || '',
      whatsappConfigured: !!wpNumber,
      telegramConfigured: !!tgUsername,
    });
  } catch (err) {
    return error(err.message || 'Failed to load settings', 500);
  }
}
