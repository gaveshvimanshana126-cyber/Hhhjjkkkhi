// ============================================================================
// Movie Mania LK — Admin Geo Diagnostics (Edge)
// Endpoint: GET /api/geo   (requires a valid admin token)
//
// Returns the country the server detects for the requesting browser plus the
// current geo-gate configuration. The admin dashboard uses this to verify that
// the whitelist is actually being applied server-side.
//
// The geo-gate logic itself lives in ./_lib/geo.js and is used by the public
// movie / TV detail endpoints.
// ============================================================================

import { json, error, handleOptions } from './_lib/respond.js';
import { verifyAdminToken, extractToken } from './_lib/adminAuth.js';
import { getGeoSettings, evaluateGeo } from './_lib/geo.js';

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

  // Admin-only: /api/geo exposes the visitor IP and gate configuration.
  const token = extractToken(request);
  const isAuthorized = await verifyAdminToken(token);
  if (!isAuthorized) {
    return error('Unauthorized: Valid admin token required', 401);
  }

  try {
    const settings = await getGeoSettings();
    const result = await evaluateGeo(request, settings);

    return json(
      {
        ip: result.ip || null,
        country: result.country || null,
        // override | header | lookup | none
        detectedBy: result.source || 'none',
        provider: result.provider || null,
        proxyDetected: !!result.proxy,
        source: {
          vercel: request.headers.get('x-vercel-ip-country') || null,
          cloudflare: request.headers.get('cf-ipcountry') || null,
        },
        gate: {
          enabled: !!settings.enabled,
          allowed: !!result.allowed,
          whitelistSize: settings.countries.length,
          unknownPolicy: settings.unknownCountry,
          hide: settings.hide,
        },
        settings,
      },
      200,
      {},
      'none'
    );
  } catch (err) {
    return error(err.message || 'Geo diagnostics failed', 500);
  }
}
