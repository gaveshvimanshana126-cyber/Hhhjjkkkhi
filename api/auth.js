// ============================================================================
// Movie Mania LK — Edge Function: Authentication Proxy API
// Endpoint: /api/auth (actions: login, register, update)
// ============================================================================

import { json, error, handleOptions } from './_lib/respond.js';
import { saveUserProfile, getUserProfile } from './_lib/firebase.js';

const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY || 'AIzaSyAh6zMB65iWqt3R2Ep0C5_7eV8ZaUHI7t8';

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
    const body = await request.json();
    const action = body.action || 'login';

    if (action === 'update') {
      const idToken = body.idToken;
      if (!idToken) {
        return error('idToken is required to update profile', 400);
      }
      const updatePayload = { idToken, returnSecureToken: true };
      if (body.password) updatePayload.password = body.password;
      if (body.displayName) updatePayload.displayName = body.displayName;
      const newPhoto = typeof body.photo === 'string' ? body.photo.trim() : '';
      if (newPhoto && !/^https:\/\/[^\s]+$/.test(newPhoto)) {
        return error('Invalid photo URL', 400);
      }

      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        }
      );
      const data = await res.json();
      if (data.error) {
        return error(data.error.message || 'Profile update failed', 400);
      }

      // Keep the admin-visible user record in sync with the new display name
      try {
        const uid = data.localId || (body.uid || '');
        if (uid) {
          const prof = await getUserProfile(uid);
          const newName = String(body.displayName || (prof && (prof.name || prof.displayName)) || '').trim();
          if (newName || newPhoto) {
            await saveUserProfile(uid, {
              ...(prof || {}),
              name: newName || (prof && prof.name) || '',
              displayName: newName || (prof && prof.displayName) || '',
              email: (prof && prof.email) || body.email || '',
              createdAt: (prof && prof.createdAt) || Date.now(),
              ...(newPhoto ? { photo: newPhoto } : {}),
            });
          }
        }
      } catch (_) {}

      return json({ success: true, ...data });
    }

    const email = (body.email || '').trim();
    const password = body.password || '';
    const name = (body.name || email.split('@')[0] || 'User').trim();

    if (!email || !password) {
      return error('Email and password are required', 400);
    }

    if (action === 'register') {
      if (password.length < 6) {
        return error('Password must be at least 6 characters', 400);
      }
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
        }
      );
      const data = await res.json();
      if (data.error) {
        return error(data.error.message || 'Registration failed', 400);
      }

      try {
        await saveUserProfile(data.localId, {
          name,
          displayName: name,
          email,
          createdAt: Date.now(),
        });
      } catch (_) {}

      return json({
        uid: data.localId,
        email: data.email,
        name,
        createdAt: Date.now(),
        idToken: data.idToken,
      });
    }

    // Default: login
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );
    const data = await res.json();
    if (data.error) {
      return error(data.error.message || 'Authentication failed', 400);
    }

    let displayName = email.split('@')[0];
    let photo = '';
    let createdAt = Date.now();
    try {
      const prof = await getUserProfile(data.localId);
      if (prof && prof.photo) photo = prof.photo;
      if (prof && (prof.name || prof.displayName)) {
        displayName = prof.name || prof.displayName || displayName;
      }
      // Backfill / refresh the profile record so the admin panel always has a
      // complete user record (name + email) to display and search.
      createdAt = (prof && prof.createdAt) || Date.now();
      await saveUserProfile(data.localId, {
        ...(prof || {}),
        name: displayName,
        displayName: displayName,
        email: data.email,
        createdAt,
        lastLoginAt: Date.now(),
      });
    } catch (_) {}

    return json({
      uid: data.localId,
      email: data.email,
      name: displayName,
      photo,
      createdAt,
      idToken: data.idToken,
    });
  } catch (err) {
    return error(err.message || 'Authentication request failed', 500);
  }
}
