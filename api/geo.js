// ============================================================================
// Movie Mania LK — Edge Function: Geo Access Diagnostics (ADMIN ONLY)
// Endpoint: /api/geo
// Reports what the server sees for this request: detected client IP, resolved
// country and the current gate status. Requires a valid admin token so the
// endpoint is not publicly reachable.
// ============================================================================

import { json, error, handleOptions } from './_lib/respond.js';
import { verifyAdminToken, extractToken } from './_lib/adminAuth.js';
import {
  getGeoSettings,
  evaluateGeo,
} from './_lib/geo.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  // Admin-only
  const token = extractToken(request);
  if (!(await verifyAdminToken(token))) {
    return error('Unauthorized: valid admin token required', 401);
  }

  const settings = await getGeoSettings();
  const evaluation = await evaluateGeo(request, settings);

  const payload = {
    // Raw headers the platform passed to the edge function
    source: {
      vercel: request.headers.get('x-vercel-ip-country') || null,
      cloudflare: request.headers.get('cf-ipcountry') || null,
      override: request.headers.get('x-country-code') || null,
    },
    ip: evaluation.ip || null,
    country: evaluation.country,          // ISO-2 code or null when unknown
    detectedBy: evaluation.source,        // 'override' | 'header' | 'lookup' | 'none'
    provider: evaluation.provider,        // which service answered
    proxyDetected: !!evaluation.proxy,    // anycast/VPN range → country may be the exit node
    gate: {
      enabled: settings.enabled,
      allowed: evaluation.allowed,        // receives downloads/players?
      whitelistSize: (settings.countries || []).length,
      unknownPolicy: settings.unknownCountry,
    },
    ts: Date.now(),
  };

  // Never cache — country differs per visitor
  return json(payload, 200, {}, 'none');
}
