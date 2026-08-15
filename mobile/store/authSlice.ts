/**
 * Auth UI state.
 * ----------------------------------------------------------------------------
 * Tokens are intentionally NOT stored here. `services/api/tokenStorage.ts` is
 * their single owner (expo-secure-store / Keychain) — axiosClient and
 * socketClient both read from it directly, and duplicating tokens into Redux
 * would create a second source of truth that can drift (e.g. a rotation
 * saved to SecureStore but not dispatched here). This slice only tracks who
 * is signed in and how, for rendering — see `app/_layout.tsx` for the actual
 * session bootstrap against tokenStorage.
 * ----------------------------------------------------------------------------
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Role, UserProfile } from '../types/api';

interface AuthState {
  user: UserProfile | null;
  role: Role | null;
  isAuthenticated: boolean;
  /** True once the cold-start session check (SecureStore + /users/me) has resolved. */
  hydrated: boolean;
}

const initialState: AuthState = {
  user: null,
  role: null,
  isAuthenticated: false,
  hydrated: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSession: (state, action: PayloadAction<{ user: UserProfile | null; role: Role }>) => {
      state.user = action.payload.user;
      state.role = action.payload.role;
      state.isAuthenticated = true;
      state.hydrated = true;
    },
    setUser: (state, action: PayloadAction<UserProfile>) => {
      state.user = action.payload;
    },
    markHydrated: (state) => {
      state.hydrated = true;
    },
    logout: (state) => {
      state.user = null;
      state.role = null;
      state.isAuthenticated = false;
      state.hydrated = true;
    },
  },
});

export const { setSession, setUser, markHydrated, logout } = authSlice.actions;
export default authSlice.reducer;
