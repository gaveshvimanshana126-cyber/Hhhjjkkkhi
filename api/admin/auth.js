// ============================================================================
// Movie Mania LK — Edge Function: Admin Authentication
// Endpoint: /api/admin/auth
// ============================================================================

import { json, error, handleOptions } from '../_lib/respond.js';
import {
  checkAdminPassword,
  createAdminToken,
  verifyAdminToken,
  extractToken,
} from '../_lib/adminAuth.js';

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

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'login';

    if (action === 'verify') {
      const token = body.token || extractToken(request);
      const valid = await verifyAdminToken(token);
      return json({ valid });
    }

    // Default: login
    const password = body.password || '';
    if (!checkAdminPassword(password)) {
      return error('Incorrect admin password', 401);
    }

    const token = await createAdminToken();
    return json({
      success: true,
      token,
      user: { email: 'admin@cineflix.lk', role: 'admin' },
    });
  } catch (err) {
    return error(err.message || 'Admin authentication failed', 500);
  }
}

