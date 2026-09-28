import { createSlice } from '@reduxjs/toolkit';

/**
 * Auth state — tokens live in MEMORY only. (#78)
 *
 * Why not localStorage?
 *   Any XSS payload can call `localStorage.getItem('qfx_auth_v2')` and exfiltrate
 *   the refresh token. Moving RT to an httpOnly cookie (server-set) makes it
 *   completely inaccessible to JavaScript — this slice no longer stores it.
 *
 * Token lifecycle:
 *   - Access token (15 min): stored here in Redux memory. Lost on page refresh →
 *     auto-restored by the silent refresh on app boot (see main.jsx).
 *   - Refresh token (30 days): httpOnly cookie set by the server. Never touches JS.
 *
 * The profile (non-sensitive) is still persisted to sessionStorage so the user's
 * name / avatar survives a page refresh without an extra API call.
 */

const SESSION_KEY = 'zappy_profile_v2'; // sessionStorage — cleared when tab closes

function loadProfile() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveProfile(profile) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(profile)); } catch {}
}

function clearProfile() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  // Also clear the old localStorage key in case it exists from a previous version
  try { localStorage.removeItem('qfx_auth_v2'); } catch {}
}

const slice = createSlice({
  name: 'auth',
  initialState: {
    accessToken:  null,   // in memory only
    refreshToken: null,   // DEPRECATED — kept for selector compatibility; always null
    profile:      loadProfile(),
    role:         loadProfile()?.role ?? null,
  },
  reducers: {
    setAuth: (state, { payload }) => {
      state.accessToken = payload.accessToken;
      state.refreshToken = null; // never store RT in JS — it's in httpOnly cookie
      state.profile = payload.profile ?? state.profile;
      state.role    = payload.role    ?? state.role;
      if (payload.profile) saveProfile({ ...payload.profile, role: payload.role });
    },
    logout: (state) => {
      state.accessToken  = null;
      state.refreshToken = null;
      state.profile      = null;
      state.role         = null;
      clearProfile();
    },
    updateProfile: (state, { payload }) => {
      state.profile = { ...state.profile, ...payload };
      saveProfile({ ...state.profile, role: state.role });
    },
  },
});

export const { setAuth, logout, updateProfile } = slice.actions;
export const selectAuth      = (s) => s.auth;
export const selectIsAuthed  = (s) => !!s.auth.accessToken;
export const selectRole      = (s) => s.auth.role;
export const selectToken     = (s) => s.auth.accessToken;
export default slice.reducer;
